import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadTransferDataContext() {
    const source = fs.readFileSync(new URL("../js/transferData.js", import.meta.url), "utf8");
    const context = {
        document: {
            getElementById: () => null,
            createElement: () => ({ setAttribute() {}, style: {}, click() {} }),
            body: { appendChild() {}, removeChild() {} },
        },
        FileReader: class {},
        localStorage: { length: 0, key: () => null, getItem: () => null },
        swal: () => {},
        console,
        Date,
        JSON,
        Promise,
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    return context;
}

test("legacy payload format imports without version wrapper", () => {
    const context = loadTransferDataContext();
    assert.equal(typeof context.normalizeImportPayload, "function");
    assert.equal(typeof context.validateImportPayload, "function");
    assert.doesNotThrow(() => {
        vm.runInContext(
            "const legacyPayload = { Algebra: {}, Geometry: {} }; const normalizedPayload = normalizeImportPayload(legacyPayload); validateImportPayload(normalizedPayload);",
            context
        );
    });
});

test("invalid wrapped payload still fails with clear message", () => {
    const context = loadTransferDataContext();
    assert.throws(
        () => {
            vm.runInContext(
                "validateImportPayload({ version: 1, notebooks: [] });",
                context
            );
        },
        /Import file is missing a valid notebooks object\./
    );
});

test("unsupported version fails with explicit version error", () => {
    const context = loadTransferDataContext();
    assert.throws(
        () => {
            vm.runInContext(
                "validateImportPayload({ version: 999, notebooks: {} });",
                context
            );
        },
        /Unsupported import version: 999\./
    );
});

test("invalid notebook payload entries fail with clear message", () => {
    const context = loadTransferDataContext();
    assert.throws(
        () => {
            vm.runInContext(
                'validateImportPayload({ version: 1, notebooks: { Algebra: "not-an-object" } });',
                context
            );
        },
        /Notebook "Algebra" must be a JSON object\./
    );
});

test("importNotebookJson smoke test imports a valid file payload", async () => {
    const context = loadTransferDataContext();
    const notifications = [];
    const savedNotebooks = [];
    const notebookNameList = [];
    let selectedNotebookName = "";
    let storeMetaInfoCalled = false;

    context.FileReader = class {
        readAsText(file) {
            this.result = file.content;
            if (typeof this.onload === "function") {
                this.onload();
            }
        }
    };
    context.swal = (options) => notifications.push(options);
    context.clone = (value) => JSON.parse(JSON.stringify(value));
    context.notebookNameList = notebookNameList;
    context.getNotebookFromStorage = async () => ({});
    context.setNotebookInStorage = async (name, notebook) => {
        savedNotebooks.push({ name, notebook });
    };
    context.storeMetaInfo = async () => {
        storeMetaInfoCalled = true;
    };
    context.setSelectedNotebook = (name) => {
        selectedNotebookName = name;
    };
    context.selectedNotebookName = "";
    context.localStorage = { length: 0, key: () => null, getItem: () => null };

    await vm.runInContext(
        `importNotebookJson({
            target: {
                files: [{
                    content: '{"version":1,"notebooks":{"Algebra":{"Quadratic":{"type":"text","position":"","link":"","content":"x^2+bx+c"}}}}'
                }]
            }
        });`,
        context
    );

    assert.equal(savedNotebooks.length, 1);
    assert.equal(savedNotebooks[0].name, "Algebra");
    assert.equal(storeMetaInfoCalled, true);
    assert.equal(selectedNotebookName, "Algebra");
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].title, "Import complete");
});

test("importNotebookJson smoke test reports invalid JSON failure", async () => {
    const context = loadTransferDataContext();
    const notifications = [];
    const savedNotebooks = [];
    let storeMetaInfoCalled = false;
    let selectedNotebookName = "";

    context.FileReader = class {
        readAsText(file) {
            this.result = file.content;
            if (typeof this.onload === "function") {
                this.onload();
            }
        }
    };
    context.swal = (options) => notifications.push(options);
    context.clone = (value) => JSON.parse(JSON.stringify(value));
    context.getNotebookFromStorage = async () => ({});
    context.setNotebookInStorage = async (name, notebook) => {
        savedNotebooks.push({ name, notebook });
    };
    context.storeMetaInfo = async () => {
        storeMetaInfoCalled = true;
    };
    context.setSelectedNotebook = (name) => {
        selectedNotebookName = name;
    };
    context.notebookNameList = [];
    context.selectedNotebookName = "";
    context.localStorage = { length: 0, key: () => null, getItem: () => null };

    await vm.runInContext(
        `importNotebookJson({
            target: {
                files: [{
                    content: '{ this is invalid json'
                }]
            }
        });`,
        context
    );

    assert.equal(savedNotebooks.length, 0);
    assert.equal(storeMetaInfoCalled, false);
    assert.equal(selectedNotebookName, "");
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].title, "Import failed");
    assert.match(notifications[0].text, /Unexpected token|Expected property name|JSON/i);
});
