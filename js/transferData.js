const exportJsonBtn = document.getElementById("exportJsonBtn");
const importJsonBtn = document.getElementById("importJsonBtn");
const importJsonInput = document.getElementById("importJsonInput");
const importFormatVersion = 1;

if (exportJsonBtn) {
    exportJsonBtn.addEventListener("click", exportNotebookJson);
}
if (importJsonBtn) {
    importJsonBtn.addEventListener("click", () => {
        importJsonInput.value = "";
        importJsonInput.click();
    });
}
if (importJsonInput) {
    importJsonInput.addEventListener("change", importNotebookJson);
}

async function exportNotebookJson() {
    try {
        const notebooks = {};
        const selectedNotebookName = getCurrentSelectedNotebookName();
        const currentNotebookSnapshot = getCurrentNotebookSnapshot();
        const notebookNames = await getExportNotebookNames();
        for (const notebookName of notebookNames) {
            const notebook = await getStoredNotebook(notebookName);
            notebooks[notebookName] = notebook || {};
        }
        // If current in-memory notebook edits have not been persisted yet, ensure
        // we still export them instead of producing an empty backup.
        if (Object.keys(currentNotebookSnapshot).length > 0) {
            const fallbackNotebookName = selectedNotebookName || "current-notebook";
            if (notebooks[fallbackNotebookName] === undefined || Object.keys(notebooks[fallbackNotebookName]).length === 0) {
                notebooks[fallbackNotebookName] = currentNotebookSnapshot;
            }
        }
        const payload = {
            version: importFormatVersion,
            meta: {
                selectedNotebookName: selectedNotebookName,
                exportedAt: new Date().toISOString(),
            },
            notebooks,
        };
        const json = JSON.stringify(payload, null, 2);
        if (typeof download === "function") {
            download("TINotes-backup.json", json);
        } else {
            downloadTextFile("TINotes-backup.json", json);
        }
        swal({
            title: "Export complete",
            text: `Exported ${Object.keys(notebooks).length} notebook(s).`,
            icon: "success",
            button: "OK",
        });
    } catch (error) {
        console.error(error);
        swal({
            title: "Export failed",
            text: error.message || "Unable to export notebooks to JSON.",
            icon: "error",
            button: "OK",
        });
    }
}

async function importNotebookJson(event) {
    try {
        const file = event.target.files && event.target.files[0];
        if (!file) {
            return;
        }
        const text = await readFileText(file);
        const parsed = JSON.parse(text);
        const normalizedPayload = normalizeImportPayload(parsed);
        validateImportPayload(normalizedPayload);
        const result = await mergeImportedNotebooks(normalizedPayload);
        await storeMetaInfo();
        if (result.firstImportedNotebookName) {
            setSelectedNotebook(result.firstImportedNotebookName, {
                storePrevious: true,
                storeSelected: true,
            });
        } else if (getCurrentSelectedNotebookName()) {
            setSelectedNotebook(getCurrentSelectedNotebookName(), {
                storePrevious: false,
                storeSelected: false,
            });
        }
        swal({
            title: "Import complete",
            text: `Imported ${result.importedNotebookCount} notebook(s) and ${result.importedItemCount} item(s). Renamed ${result.renamedNotebookCount} notebook(s) and ${result.renamedItemCount} item(s).`,
            icon: "success",
            button: "OK",
        });
    } catch (error) {
        console.error(error);
        swal({
            title: "Import failed",
            text: error.message || "Invalid JSON import file.",
            icon: "error",
            button: "OK",
        });
    }
}

function validateImportPayload(payload) {
    if (!(payload instanceof Object)) {
        throw new Error("Import file must be a JSON object.");
    }
    if (payload.version !== importFormatVersion) {
        throw new Error(`Unsupported import version: ${payload.version}.`);
    }
    if (!(payload.notebooks instanceof Object) || Array.isArray(payload.notebooks)) {
        throw new Error("Import file is missing a valid notebooks object.");
    }
}

function normalizeImportPayload(payload) {
    if (!(payload instanceof Object) || Array.isArray(payload)) {
        return payload;
    }
    const hasVersion = Object.prototype.hasOwnProperty.call(payload, "version");
    const hasNotebooks = Object.prototype.hasOwnProperty.call(payload, "notebooks");
    if (hasVersion || hasNotebooks) {
        return payload;
    }
    return {
        version: importFormatVersion,
        meta: {
            importedFromLegacyFormat: true,
        },
        notebooks: payload,
    };
}

async function mergeImportedNotebooks(payload) {
    let importedNotebookCount = 0;
    let importedItemCount = 0;
    let renamedNotebookCount = 0;
    let renamedItemCount = 0;
    let firstImportedNotebookName;

    const notebookNamesRef = getCurrentNotebookNameList();
    const existingNotebookNames = new Set(notebookNamesRef);
    const importedNotebookNames = Object.keys(payload.notebooks);
    for (const importedNotebookName of importedNotebookNames) {
        const importedNotebook = payload.notebooks[importedNotebookName] || {};
        const destinationNotebookName = getUniqueNotebookName(importedNotebookName, existingNotebookNames);
        if (destinationNotebookName !== importedNotebookName) {
            renamedNotebookCount++;
        }
        const destinationNotebook = await getNotebookFromStorage(destinationNotebookName) || {};
        const mergeResult = mergeNotebookItems(destinationNotebook, importedNotebook);
        renamedItemCount += mergeResult.renamedItemCount;
        importedItemCount += mergeResult.importedItemCount;
        await setNotebookInStorage(destinationNotebookName, mergeResult.notebook);
        if (!existingNotebookNames.has(destinationNotebookName)) {
            notebookNamesRef.push(destinationNotebookName);
            existingNotebookNames.add(destinationNotebookName);
        }
        importedNotebookCount++;
        if (!firstImportedNotebookName) {
            firstImportedNotebookName = destinationNotebookName;
        }
    }

    return {
        importedNotebookCount,
        importedItemCount,
        renamedNotebookCount,
        renamedItemCount,
        firstImportedNotebookName,
    };
}

function mergeNotebookItems(existingNotebook, importedNotebook) {
    const resultNotebook = clone(existingNotebook);
    const importedNameMap = {};
    let renamedItemCount = 0;
    let importedItemCount = 0;

    const importedItemNames = Object.keys(importedNotebook);
    importedItemNames.forEach((itemName) => {
        const uniqueItemName = getUniqueItemName(itemName, resultNotebook);
        if (uniqueItemName !== itemName) {
            renamedItemCount++;
        }
        importedNameMap[itemName] = uniqueItemName;
    });

    importedItemNames.forEach((itemName) => {
        const sourceItem = importedNotebook[itemName];
        const renamedItemName = importedNameMap[itemName];
        const clonedItem = clone(sourceItem);
        if (clonedItem.position && importedNameMap[clonedItem.position]) {
            clonedItem.position = importedNameMap[clonedItem.position];
        }
        if (clonedItem.link && importedNameMap[clonedItem.link]) {
            clonedItem.link = importedNameMap[clonedItem.link];
        }
        resultNotebook[renamedItemName] = clonedItem;
        importedItemCount++;
    });

    return {
        notebook: resultNotebook,
        renamedItemCount,
        importedItemCount,
    };
}

function getUniqueNotebookName(notebookName, existingNotebookNames) {
    if (!existingNotebookNames.has(notebookName)) {
        return notebookName;
    }
    let suffix = 1;
    let candidate = `${notebookName} (imported)`;
    while (existingNotebookNames.has(candidate)) {
        suffix++;
        candidate = `${notebookName} (imported ${suffix})`;
    }
    return candidate;
}

function getUniqueItemName(itemName, notebook) {
    if (notebook[itemName] === undefined) {
        return itemName;
    }
    const segments = itemName.split("/");
    const shortName = segments.pop();
    const parentPath = segments.join("/");
    let suffix = 1;
    let candidateShortName = `${shortName} (imported)`;
    let candidateName = parentPath ? `${parentPath}/${candidateShortName}` : candidateShortName;
    while (notebook[candidateName] !== undefined) {
        suffix++;
        candidateShortName = `${shortName} (imported ${suffix})`;
        candidateName = parentPath ? `${parentPath}/${candidateShortName}` : candidateShortName;
    }
    return candidateName;
}

function readFileText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Unable to read selected file."));
        reader.readAsText(file);
    });
}

function downloadTextFile(filename, text) {
    const element = document.createElement("a");
    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
    element.setAttribute("download", filename);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

async function getExportNotebookNames() {
    const notebookNames = getCurrentNotebookNameList();
    if (notebookNames.length > 0) {
        return notebookNames.filter((name) => typeof name === "string" && name.length > 0);
    }
    if (typeof localforage !== "undefined" && typeof localforage.keys === "function") {
        return localforage.keys();
    }
    return [];
}

async function getStoredNotebook(notebookName) {
    if (typeof getNotebookFromStorage === "function") {
        return getNotebookFromStorage(notebookName);
    }
    if (typeof localforage !== "undefined" && typeof localforage.getItem === "function") {
        return localforage.getItem(notebookName);
    }
    throw new Error("Notebook storage backend is unavailable.");
}

function getCurrentNotebookNameList() {
    try {
        if (Array.isArray(notebookNameList)) {
            return notebookNameList;
        }
    } catch (error) {
        // Swallow TDZ/global access errors and fall back to storage lookup.
    }
    return [];
}

function getCurrentSelectedNotebookName() {
    try {
        if (typeof selectedNotebookName === "string") {
            return selectedNotebookName;
        }
    } catch (error) {
        // Swallow TDZ/global access errors and default to empty.
    }
    return "";
}

function getCurrentNotebookSnapshot() {
    const snapshot = {};
    if (typeof localStorage === "undefined") {
        return snapshot;
    }
    for (let i = 0; i < localStorage.length; i++) {
        const itemName = localStorage.key(i);
        const rawValue = localStorage.getItem(itemName);
        if (!rawValue) {
            continue;
        }
        try {
            const item = JSON.parse(rawValue);
            if (item && typeof item === "object" && typeof item.type === "string") {
                snapshot[itemName] = item;
            }
        } catch (error) {
            // Ignore unrelated localStorage keys that are not JSON note items.
        }
    }
    return snapshot;
}
