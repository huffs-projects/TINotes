import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function createLocalStorageMock() {
    const store = new Map();
    return {
        get length() {
            return store.size;
        },
        key(index) {
            return Array.from(store.keys())[index] ?? null;
        },
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(String(key), String(value));
        },
        removeItem(key) {
            store.delete(String(key));
        },
        clear() {
            store.clear();
        },
    };
}

function loadNotebookMenuContext() {
    const source = fs.readFileSync(new URL("../js/notebookMenu.js", import.meta.url), "utf8");
    const noop = () => {};
    const fakeElement = {
        classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
        addEventListener: noop,
        querySelector: () => fakeElement,
        appendChild: noop,
        remove: noop,
        setAttribute: noop,
        getAttribute: () => "",
        focus: noop,
        value: "",
        textContent: "",
        innerHTML: "",
    };
    const context = {
        document: {
            querySelector: () => fakeElement,
            getElementById: () => fakeElement,
            createElement: () => ({ ...fakeElement }),
        },
        window: { addEventListener: noop },
        localStorage: createLocalStorageMock(),
        console: { ...console, log: noop, warn: noop },
        setTimeout: noop,
        Promise,
        Object,
        JSON,
        Array,
        getCurrentSelectedItemName: () => "",
        clearAllItems: noop,
        updateAtPosition: noop,
        setItemInStorage: noop,
        getItemFromStorage: () => ({}),
        createItemNameInput: () => ({ ...fakeElement }),
        insertAfter: noop,
        createErrorMessage: noop,
        removeElementInArray: noop,
        replaceElementInArray: noop,
        homePosition: "",
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    return context;
}

test("notebook storage falls back when localforage is unavailable", async () => {
    const context = loadNotebookMenuContext();
    assert.equal(typeof context.createNotebookStorageBackend, "function");

    const fallbackStore = context.createNotebookStorageBackend();
    assert.equal(typeof fallbackStore.getItem, "function");
    assert.equal(typeof fallbackStore.setItem, "function");

    await fallbackStore.setItem("algebra", { item: "x^2" });
    const stored = await fallbackStore.getItem("algebra");
    assert.deepEqual(stored, { item: "x^2" });

    const scoped = fallbackStore.createInstance({ name: "metaInfo" });
    await scoped.setItem("selectedNotebookName", "algebra");
    const scopedValue = await scoped.getItem("selectedNotebookName");
    assert.equal(scopedValue, "algebra");
});

test("fallback clear only removes keys in scope", async () => {
    const context = loadNotebookMenuContext();
    const fallbackStore = context.createNotebookStorageBackend();
    const scoped = fallbackStore.createInstance({ name: "metaInfo" });

    context.localStorage.setItem("external:key", JSON.stringify({ keep: true }));
    await fallbackStore.setItem("geometry", { item: "circle" });
    await scoped.setItem("selectedNotebookName", "geometry");
    await scoped.clear();

    assert.deepEqual(JSON.parse(context.localStorage.getItem("external:key")), { keep: true });
    assert.deepEqual(await fallbackStore.getItem("geometry"), { item: "circle" });
    assert.equal(await scoped.getItem("selectedNotebookName"), null);
});

test("clearSelectedNotebook keeps persisted fallback notebook entries", () => {
    const context = loadNotebookMenuContext();

    context.localStorage.setItem("home/file1", JSON.stringify({ type: "file", position: "home" }));
    context.localStorage.setItem("external:key", JSON.stringify({ keep: true }));
    context.localStorage.setItem("tinotes:notebook:Algebra", JSON.stringify({ Quadratic: { type: "file" } }));
    context.localStorage.setItem("tinotes:notebook:metaInfo:selectedNotebookName", JSON.stringify("Algebra"));

    context.clearSelectedNotebook();

    assert.equal(context.localStorage.getItem("home/file1"), null);
    assert.deepEqual(JSON.parse(context.localStorage.getItem("external:key")), { keep: true });
    assert.deepEqual(
        JSON.parse(context.localStorage.getItem("tinotes:notebook:Algebra")),
        { Quadratic: { type: "file" } }
    );
    assert.equal(
        JSON.parse(context.localStorage.getItem("tinotes:notebook:metaInfo:selectedNotebookName")),
        "Algebra"
    );
});
