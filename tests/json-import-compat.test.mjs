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
