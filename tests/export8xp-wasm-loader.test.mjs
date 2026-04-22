import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function createBaseContext() {
    const source = fs.readFileSync(new URL("../js/export8xp.js", import.meta.url), "utf8");
    const URLCtor = URL;
    URLCtor.createObjectURL = () => "blob:fake";
    URLCtor.revokeObjectURL = () => {};
    const context = {
        console,
        Uint8Array,
        Date,
        Math,
        Promise,
        URL: URLCtor,
        Blob: class Blob {
            constructor(parts, options) {
                this.parts = parts;
                this.options = options;
            }
        },
        location: { origin: "https://example.com" },
        document: {
            baseURI: "https://example.com/app/index.html",
            querySelector: () => null,
            createElement: () => ({ style: {}, click: () => {}, remove: () => {} }),
            head: { appendChild: () => {} },
            body: { appendChild: () => {}, removeChild: () => {} },
        },
        setTimeout: (fn) => fn(),
    };
    context.window = context;
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(source, context);
    return context;
}

test("loadTivars uses wasm module factory when available", async () => {
    const context = createBaseContext();
    const readPaths = [];
    const mockLib = {
        TIModel: { createFromName: (name) => ({ name }) },
        TIVarType: { createFromName: (name) => ({ name }) },
        TIVarFile: {
            createNew: () => ({
                setContentFromString: () => {},
                saveVarToFile: () => "/tmp/program.8xp",
            }),
        },
        FS: {
            readFile: (path) => {
                readPaths.push(path);
                return new Uint8Array([1, 2, 3, 4]);
            },
            unlink: () => {},
        },
    };
    context.__TINOTES_DYNAMIC_IMPORT__ = async (url) => {
        context.importedUrl = url;
        return { default: () => Promise.resolve(mockLib) };
    };

    const bytes = await context.TINotesExport8xp.build8xp("TINOTES", "Disp 1", "monochrome");
    assert.equal(context.importedUrl, "https://example.com/app/lib/tivars/tivars_wasm.js");
    assert.deepEqual(Array.from(bytes), [1, 2, 3, 4]);
    assert.deepEqual(readPaths, ["/tmp/program.8xp"]);
});

test("build8xp supports modern wasm API without TIModel", async () => {
    const context = createBaseContext();
    const mockLib = {
        TIVarFile: {
            createNew: (type, name) => {
                assert.equal(type, "Program");
                assert.equal(name, "TINOTES");
                return {
                    setContentFromString: () => {},
                    saveVarToFile: () => "/tmp/modern.8xp",
                };
            },
        },
        FS: {
            readFile: () => new Uint8Array([7, 8, 9]),
            unlink: () => {},
        },
    };
    context.__TINOTES_DYNAMIC_IMPORT__ = async () => ({ default: () => Promise.resolve(mockLib) });

    const bytes = await context.TINotesExport8xp.build8xp("TINOTES", "Disp 1", "monochrome");
    assert.deepEqual(Array.from(bytes), [7, 8, 9]);
});

test("loadTivars reports a clear error when wasm and legacy both fail", async () => {
    const context = createBaseContext();
    context.TIVARS_WASM_FALLBACK_URLS = [];
    context.__TINOTES_DYNAMIC_IMPORT__ = async () => {
        throw new Error("module import failed");
    };

    await assert.rejects(
        () => context.TINotesExport8xp.loadTivars(),
        /WASM-only mode/
    );
});

test("wasm locateFile remaps local renamed artifact", async () => {
    const context = createBaseContext();
    let resolvedWasmUrl = null;
    context.__TINOTES_DYNAMIC_IMPORT__ = async () => ({
        default: (options) => {
            resolvedWasmUrl = options.locateFile("TIVarsLib.wasm", "");
            return Promise.resolve({
                TIModel: { createFromName: () => ({}) },
                TIVarType: { createFromName: () => ({}) },
                TIVarFile: { createNew: () => ({}) },
                FS: { readFile: () => new Uint8Array([1]), unlink: () => {} },
            });
        },
    });

    await context.TINotesExport8xp.loadTivars();
    assert.equal(resolvedWasmUrl, "https://example.com/app/lib/tivars/tivars_wasm.wasm");
});

test("file protocol reports wasm-only mode failure details", async () => {
    const context = createBaseContext();
    context.location.protocol = "file:";
    context.location.origin = "null";
    context.__TINOTES_DYNAMIC_IMPORT__ = async () => {
        throw new Error("module source blocked on file protocol");
    };

    await assert.rejects(
        () => context.TINotesExport8xp.loadTivars(),
        /Serve app over http\(s\)/
    );
});
