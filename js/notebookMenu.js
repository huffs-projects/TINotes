const notebookStoragePrefix = "tinotes:notebook:";
const notebookStorage = createNotebookStorageBackend();
// set drivers for localforage, excluding localstorage
notebookStorage.setDriver([notebookStorage.WEBSQL, notebookStorage.INDEXEDDB]);
// separate instance for storing meta info
const metaInfo = notebookStorage.createInstance({
    name: "metaInfo"
});
metaInfo.setDriver([notebookStorage.WEBSQL, notebookStorage.INDEXEDDB]);

const toggleBtn = document.querySelector('#hamburger-icon.toggle-btn');
const sidebar = document.getElementById("sidebar");
const notebookMenu = sidebar.querySelector("ul");
const addNotebookBtn = document.getElementById("addNotebookBtn");
toggleBtn.addEventListener("click", (event) => {
    event.preventDefault(); // prevent scrolling up to top
    sidebar.classList.toggle("active");
    toggleBtn.classList.toggle("active");
});
let notebookNameList = [];
let selectedNotebookName; // store the selected notebook name
const defaultNotebookName = "notebook1";

sanitizeNotebookStorage().then(() => {
    loadMetaInfo().then(() => {
        const notebookSize = notebookNameList.length;
        console.log('TCL: notebookSize', notebookSize);
        if (notebookSize > 0) {
            // load notebooks in storage
            loadNotebookMenu();
        } else {
            // add default notebook
            addDefaultNotebook();
        }
    });
});

// periodically store selected notebook
setTimeout(function periodicallyStoreNotebook() {
    storeSelectedNotebook().then(
        () => {
            console.log("storing selected notebook...");
            setTimeout(periodicallyStoreNotebook, 1000);
        }
    );
}, 1000);

// select notebook on click
notebookMenu.addEventListener("click", (e) => {
    const target = e.target;
    if (target.classList.contains("notebook")) {
        target.classList.add("selected");
        const selectedNotebookName = target.getAttribute("data-name");
        setSelectedNotebook(selectedNotebookName);
    }
});

// add new notebook
addNotebookBtn.addEventListener("click", () => {
    addNotebook();
})

// store notebook when window is unloaded
window.addEventListener("beforeunload", (e) => {
    return "";
});

function storeMetaInfo() {
	// console.log('TCL: storeMetaInfo -> selectedNotebookName', selectedNotebookName);
    return metaInfo.clear().then(() => {
        return Promise.all([
            setMetaInfo("notebookNameList", notebookNameList),
            setMetaInfo("selectedNotebookName", selectedNotebookName)
        ]);
    });
}

function loadMetaInfo() {
    return Promise.all([
        getMetaInfo("notebookNameList").then((nameList) => {
            if (nameList) {
                notebookNameList = nameList;
            }
        }),
        getMetaInfo("selectedNotebookName").then((selected) => {
            if (selected) {
                selectedNotebookName = selected;
            }
        })
    ]);
}

function setMetaInfo(key, value) {
    return metaInfo.setItem(key, value).catch(function (err) {
        console.log(err);
    });
}

function getMetaInfo(key) {
    return metaInfo.getItem(key).catch(function (err) {
        console.log(err);
    })
}

function storeSelectedNotebook() {
    const currentNotebook = getCurrentNotebook();
    // console.log('TCL: storeSelectedNotebook -> currentNotebook', selectedNotebookName);
    return setNotebookInStorage(selectedNotebookName, currentNotebook);
}

function addNotebook(previousNotebookLabel) {
    const notebookNameInput = createItemNameInput("notebook");
    if (previousNotebookLabel) {
        insertAfter(previousNotebookLabel, notebookNameInput);
        previousNotebookLabel.remove();
    } else {
        notebookMenu.appendChild(notebookNameInput);
    }
    notebookNameInput.focus();
    notebookNameInput.addEventListener("keypress", (e) => {
        if (e.keyCode == 13) { // ENTER key
            const newNotebookName = notebookNameInput.value.trim();
            if (notebookNameList.indexOf(newNotebookName) >= 0) { // repeated name
                createErrorMessage(notebookNameInput,
                    `Duplicated notebook name`);
            } else if (newNotebookName.length === 0) {
                createErrorMessage(notebookNameInput,
                    `Notebook name cannot be empty`);
            } else {
                // add to notebook name list
                notebookNameList.push(newNotebookName);
                displayNotebookLabel(newNotebookName, notebookNameInput);
                // remove item name input
                notebookNameInput.remove();
                // rename selected notebook
                setSelectedNotebook(newNotebookName);
            }
        }
    });
}

function setSelectedNotebook(notebookName, opts) {
    const defaultOpts = {
        storePrevious: true,
        storeSelected: true,
    };
    const mergedOpts = {
        ...defaultOpts,
        ...opts
    };
    const storePrevious = mergedOpts.storePrevious;
    const storeSelected = mergedOpts.storeSelected;

    // delete styling of old selected notebook
    const oldSelectedNotebook = notebookMenu.querySelector(`li[data-name="${selectedNotebookName}"]`);
    if (oldSelectedNotebook) {
        console.log('TCL: setSelectedNotebook -> oldSelectedNotebook', oldSelectedNotebook);
        oldSelectedNotebook.classList.remove("selected");
    }

    // store previous notebook and switch new newly selected notebook
    if (!storePrevious) {
        selectedNotebookName = notebookName;
    }
    if (storeSelected) {
        storeSelectedNotebook().then(() => {
            switchToNewNotebook();
        });
    } else {
        switchToNewNotebook();
    }

    function switchToNewNotebook() {
        // switch to newly selected notebook
        selectedNotebookName = notebookName;
        let notebookLabel = notebookMenu.querySelector(`li[data-name="${notebookName}"]`);
        if (!notebookLabel) {
            displayNotebookLabel(notebookName);
            notebookLabel = notebookMenu.querySelector(`li[data-name="${notebookName}"]`);
        }
		// console.log('TCL: switchToNewNotebook -> notebookLabel', notebookLabel);
        if (notebookLabel) {
            notebookLabel.classList.add("selected");
        }
        // load the selected notebook
        loadNotebook(notebookName);

        storeMetaInfo();
    }
}

// display and store the default notebook
function addDefaultNotebook() {
    console.log('TCL: addDefaultNotebook -> addDefaultNotebook');
    // display the default notebook
    displayNotebookLabel(defaultNotebookName);
    notebookNameList.push(defaultNotebookName);
    // set selected notebook to the default one
    setSelectedNotebook(defaultNotebookName, {
        storePrevious: false
    });
}

function loadNotebook(notebookName) {
    clearSelectedNotebook();
    getNotebookFromStorage(notebookName).then((notebook) => {
        if (notebook instanceof Object) {
            Object.keys(notebook).forEach(itemName => {
                const item = notebook[itemName];
                setItemInStorage(itemName, item);
            });
            updateAtPosition(homePosition);
        }
    });
}

function loadNotebookMenu() {
    console.log('TCL: loadNotebookMenu -> notebookNameList', notebookNameList);
    notebookNameList.forEach(notebookName => {
        console.log('TCL: loadNotebookMenu -> notebookName', notebookName);
        // notebookNameList.push(notebookName);
        displayNotebookLabel(notebookName);
    });
    const fallbackNotebookName =
        typeof selectedNotebookName === "string" && notebookNameList.includes(selectedNotebookName)
            ? selectedNotebookName
            : notebookNameList[0];
    if (!fallbackNotebookName) {
        return;
    }
    setSelectedNotebook(fallbackNotebookName, {
        storePrevious: false,
        storeSelected: false
    });
}

function getCurrentNotebook() {
    const notebook = {};
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith(notebookStoragePrefix)) {
            return;
        }
        const item = getItemFromStorage(key);
        if (item && typeof item === "object" && typeof item.type === "string") {
            notebook[key] = item;
        }
    });
    return notebook;
}

function renameNotebook(notebookLabel) {
    const oldNotebookName = notebookLabel.innerHTML;
    const notebookNameInput = createItemNameInput("notebook");
    insertAfter(notebookLabel, notebookNameInput);
    notebookNameInput.focus();
    notebookLabel.remove();
    notebookNameInput.addEventListener("keypress", (e) => {
        if (e.keyCode == 13) { // ENTER key
            const newNotebookName = notebookNameInput.value;
            if (notebookNameList.indexOf(newNotebookName) >= 0 && newNotebookName !== oldNotebookName) { // repeated name
                createErrorMessage(notebookNameInput,
                    `Duplicated notebook name`);
            } else {
                replaceElementInArray(notebookNameList, oldNotebookName, newNotebookName);
                renameNotebookInStorage(oldNotebookName, newNotebookName);
                displayNotebookLabel(newNotebookName, notebookNameInput);
                // remove item name input
                notebookNameInput.remove();
                // rename selected notebook
                setSelectedNotebook(newNotebookName);
            }
        }
    })
}

function displayNotebookLabel(notebookName, labelPosition) {
    const notebookLabel = document.createElement("li");
    notebookLabel.classList.add("item");
    notebookLabel.classList.add("notebook");
    notebookLabel.setAttribute("data-name", notebookName);
    notebookLabel.textContent = notebookName;
    if (labelPosition) {
        insertAfter(labelPosition, notebookLabel);
    } else {
        notebookMenu.appendChild(notebookLabel);
    }
}

function renameNotebookInStorage(oldNotebookName, newNotebookName) {
	// console.log('TCL: renameNotebookInStorage -> renameNotebookInStorage');
    getNotebookFromStorage(oldNotebookName)
        .then((notebook) => setNotebookInStorage(newNotebookName, notebook));
    removeNotebookFromStorage(oldNotebookName);
}

function removeNotebook(notebookLabel) {
    const notebookName = notebookLabel.getAttribute("data-name");
    console.log('TCL: removeNotebook -> notebookName', notebookName);
    removeNotebookFromStorage(notebookName).then(() => {
        console.log(`Doing further operations after removing ${notebookName}...`);
        if (selectedNotebookName === notebookName) {
            clearSelectedNotebook();
            console.log('TCL: removeNotebook -> clearSelectedNotebook');
        }
        const removedNotebookIndex = notebookNameList.indexOf(notebookName);
        let previousNotebookName;
        if (removedNotebookIndex < notebookNameList.length - 1) { // before last
            previousNotebookName = notebookNameList[removedNotebookIndex + 1];
        } else if (removedNotebookIndex > 0) { // last but not the only one
            previousNotebookName = notebookNameList[removedNotebookIndex - 1];
        } else { // last and the only one
            addDefaultNotebook();
        }
        if (previousNotebookName) {
            console.log('TCL: removeNotebook -> previousNotebookName', previousNotebookName);
            setSelectedNotebook(previousNotebookName, {
                storePrevious: false
            });
        }
        removeElementInArray(notebookNameList, notebookName);
        notebookLabel.remove();
    });
}

// Remove all items from storage and delete all labels!!!
function clearSelectedNotebook() {
    clearAllItems();
    clearCurrentNotebookCache();
}

function removeNotebookFromStorage(notebookName) {
    console.log('TCL: removeNotebookFromStorage -> removeNotebookFromStorage', notebookName);
    return notebookStorage.removeItem(notebookName).catch(function (err) {
        console.log(err);
    });
}

function getNotebookFromStorage(notebookName) {
    if (typeof notebookName !== "string" || notebookName.length === 0) {
        return Promise.resolve({});
    }
    return notebookStorage
        .getItem(notebookName)
        .then((notebook) => {
            if (notebook && typeof notebook === "object") {
                return notebook;
            }
            return {};
        })
        .catch((error) => {
            console.warn(`Unable to load notebook "${notebookName}".`, error);
            return {};
        });
}

function setNotebookInStorage(notebookName, notebook) {
    return notebookStorage.setItem(notebookName, notebook).catch(err => {
        console.log(err);
    });
}

function clearAllStorage(){
    notebookNameList = [];
    localStorage.clear();
    notebookStorage.clear();
    metaInfo.clear();
}

function createNotebookStorageBackend() {
    if (typeof localforage !== "undefined" && localforage) {
        return localforage;
    }
    console.warn("localforage is unavailable; falling back to localStorage-backed notebook storage.");
    return createLocalStorageStore(notebookStoragePrefix);
}

function clearCurrentNotebookCache() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || key.startsWith(notebookStoragePrefix)) {
            continue;
        }
        const rawValue = localStorage.getItem(key);
        if (!rawValue) {
            continue;
        }
        try {
            const parsedValue = JSON.parse(rawValue);
            if (parsedValue && typeof parsedValue === "object" && typeof parsedValue.type === "string") {
                keysToRemove.push(key);
            }
        } catch (error) {
            // Ignore non-JSON localStorage keys that do not represent notebook cache entries.
        }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
}

function createLocalStorageStore(prefix) {
    function parseStoredValue(rawValue, key) {
        if (rawValue === null) {
            return null;
        }
        try {
            return JSON.parse(rawValue);
        } catch (error) {
            console.warn(`Unable to parse stored value for ${key}.`, error);
            return null;
        }
    }

    function createScopedStore(scopePrefix) {
        return {
            WEBSQL: "WEBSQL",
            INDEXEDDB: "INDEXEDDB",
            setDriver: () => Promise.resolve(),
            createInstance: ({ name }) => createScopedStore(`${scopePrefix}${name}:`),
            iterate: (iterator) => {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key || !key.startsWith(scopePrefix)) {
                        continue;
                    }
                    const cleanKey = key.slice(scopePrefix.length);
                    iterator(parseStoredValue(localStorage.getItem(key), cleanKey), cleanKey);
                }
                return Promise.resolve();
            },
            removeItem: (key) => {
                localStorage.removeItem(`${scopePrefix}${key}`);
                return Promise.resolve();
            },
            getItem: (key) => Promise.resolve(parseStoredValue(localStorage.getItem(`${scopePrefix}${key}`), key)),
            setItem: (key, value) => {
                try {
                    localStorage.setItem(`${scopePrefix}${key}`, JSON.stringify(value));
                    return Promise.resolve(value);
                } catch (error) {
                    return Promise.reject(error);
                }
            },
            clear: () => {
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(scopePrefix)) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach((key) => localStorage.removeItem(key));
                return Promise.resolve();
            },
        };
    }

    return createScopedStore(prefix);
}

function sanitizeNotebookStorage() {
    const tasks = [
        sanitizeNotebookStoreEntries(),
        sanitizeMetaInfoEntries(),
        sanitizeCurrentNotebookCacheEntries(),
    ];
    return Promise.all(tasks).catch((error) => {
        console.warn("Failed to sanitize notebook storage.", error);
    });
}

function sanitizeNotebookStoreEntries() {
    const badNotebookKeys = [];
    return notebookStorage
        .iterate((value, key) => {
            if (!value || typeof value !== "object" || Array.isArray(value)) {
                badNotebookKeys.push(key);
            }
        })
        .then(() => Promise.all(badNotebookKeys.map((key) => notebookStorage.removeItem(key))))
        .catch((error) => {
            console.warn("Failed to sanitize notebook entries.", error);
        });
}

function sanitizeMetaInfoEntries() {
    return Promise.all([
        getMetaInfo("notebookNameList").then((value) => {
            if (value === null || value === undefined || Array.isArray(value)) {
                return;
            }
            return setMetaInfo("notebookNameList", []);
        }),
        getMetaInfo("selectedNotebookName").then((value) => {
            if (value === null || value === undefined || typeof value === "string") {
                return;
            }
            return setMetaInfo("selectedNotebookName", "");
        }),
    ]).catch((error) => {
        console.warn("Failed to sanitize notebook meta info.", error);
    });
}

function sanitizeCurrentNotebookCacheEntries() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || key.startsWith(notebookStoragePrefix)) {
            continue;
        }
        const rawValue = localStorage.getItem(key);
        if (rawValue === null || rawValue === undefined || rawValue === "undefined") {
            keysToRemove.push(key);
            continue;
        }
        try {
            const parsedValue = JSON.parse(rawValue);
            if (!parsedValue || typeof parsedValue !== "object" || typeof parsedValue.type !== "string") {
                keysToRemove.push(key);
            }
        } catch (error) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    return Promise.resolve();
}