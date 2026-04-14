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
        for (const notebookName of notebookNameList) {
            const notebook = await getNotebookFromStorage(notebookName);
            notebooks[notebookName] = notebook || {};
        }
        const payload = {
            version: importFormatVersion,
            meta: {
                selectedNotebookName,
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
            text: "Unable to export notebooks to JSON.",
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
        validateImportPayload(parsed);
        const result = await mergeImportedNotebooks(parsed);
        await storeMetaInfo();
        if (result.firstImportedNotebookName) {
            setSelectedNotebook(result.firstImportedNotebookName, {
                storePrevious: true,
                storeSelected: true,
            });
        } else if (selectedNotebookName) {
            setSelectedNotebook(selectedNotebookName, {
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

async function mergeImportedNotebooks(payload) {
    let importedNotebookCount = 0;
    let importedItemCount = 0;
    let renamedNotebookCount = 0;
    let renamedItemCount = 0;
    let firstImportedNotebookName;

    const existingNotebookNames = new Set(notebookNameList);
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
            notebookNameList.push(destinationNotebookName);
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
