import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadGenerateScriptContext() {
    const source = fs.readFileSync(new URL("../js/generateScript.js", import.meta.url), "utf8");
    const noop = () => {};
    const fakeButton = { addEventListener: noop };
    const fakeViewer = { select: noop, value: "", remove: noop };
    const fakePopupBody = { insertBefore: noop };
    const context = {
        document: {
            getElementById: (id) => {
                if (id === "viewer") {
                    return fakeViewer;
                }
                return fakeButton;
            },
            querySelector: () => fakePopupBody,
            querySelectorAll: () => [],
            createElement: () => ({ setAttribute: noop, style: {}, click: noop }),
            body: { appendChild: noop, removeChild: noop },
            execCommand: noop,
        },
        iterateStorage: () => {},
        calculateItemSize: () => 1,
        createFileEditor: () => fakeViewer,
        getEndOfActivePosition: (value) => value,
        convertSymbolsToWords: (value) => value,
        convertWordsToSymbols: (value) => value,
        swal: noop,
        console,
        RegExp,
    };
    if (typeof RegExp.escape !== "function") {
        context.RegExp.escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    vm.createContext(context);
    vm.runInContext(source, context);
    return context;
}

test("sanitizeSourceCoderString maps known unicode and strips replacement character", () => {
    const context = loadGenerateScriptContext();
    assert.equal(typeof context.sanitizeSourceCoderString, "function");
    vm.runInContext(
        `
        exportSanitizationReport = createSanitizationReport();
        sanitized = sanitizeSourceCoderString("ωθV₀₁₂⁻�", "test");
        total = exportSanitizationReport.totalReplacements;
    `,
        context
    );
    assert.equal(context.sanitized, "omegathetaV012-");
    // NFKD converts many unicode digits/minus variants to ASCII without counting as explicit replacements;
    // we still expect omega/theta/unknown replacements to be tracked.
    assert.equal(context.total, 4);
});

test("sanitizeSourceCoderString replaces unknown non-ascii with fallback marker", () => {
    const context = loadGenerateScriptContext();
    vm.runInContext(
        `
        exportSanitizationReport = createSanitizationReport();
        sanitized = sanitizeSourceCoderString("A漢B", "test");
        replacementKeys = Object.keys(exportSanitizationReport.replacementCounts);
    `,
        context
    );
    assert.equal(context.sanitized, "A?B");
    assert.ok(context.replacementKeys.some((key) => key.includes("->?")));
});

test("sanitizeSourceCoderString strips diacritics instead of using fallback marker", () => {
    const context = loadGenerateScriptContext();
    vm.runInContext(
        `
        exportSanitizationReport = createSanitizationReport();
        sanitized = sanitizeSourceCoderString("AéB", "test");
        total = exportSanitizationReport.totalReplacements;
    `,
        context
    );
    assert.equal(context.sanitized, "AeB");
    assert.equal(context.total, 1);
});

test("prepareScriptForExport regenerates and normalizes line endings", () => {
    const context = loadGenerateScriptContext();
    assert.equal(typeof context.prepareScriptForExport, "function");
    assert.equal(typeof context.exportScript, "function");

    // Stub generation pipeline so we can test behavior deterministically.
    vm.runInContext(
        `
        // In real exports, newlines are preserved; sanitization happens on menu/file strings.
        // For this regression test, just simulate "unsupported char becomes ?".
        generateScript = () => { script = "Aé\\nB"; exportSanitizationReport = createSanitizationReport(); };
        changeScriptFormat = () => { script = script.replace(/é/g, "?"); };
        prepareScriptForExport();
        prepared = script;
    `,
        context
    );

    assert.equal(context.prepared, "A?\r\nB");
});

test("prepareScriptForExport(forceWarning) resets sanitization warning latch", () => {
    const context = loadGenerateScriptContext();
    let swalCalls = 0;
    context.swal = () => {
        swalCalls += 1;
    };

    vm.runInContext(
        `
        // Simulate a prior warning already shown.
        hasShownSanitizationWarning = true;
        exportSanitizationReport = createSanitizationReport();
        exportSanitizationReport.totalReplacements = 1;
        exportSanitizationReport.touchedContexts.add("x");
        exportSanitizationReport.replacementCounts["é->?"] = 1;
        // Stub generation so prepareScriptForExport doesn't require baseScript, storage, etc.
        generateScript = () => { script = ""; };
        changeScriptFormat = () => {};
        prepareScriptForExport({ forceWarning: true });
        warnedBefore = hasShownSanitizationWarning;
        showSanitizationWarningIfNeeded();
        warnedAfter = hasShownSanitizationWarning;
    `,
        context
    );

    assert.equal(context.warnedBefore, false);
    assert.equal(context.warnedAfter, true);
    assert.equal(swalCalls, 1);
});

test("splitMenuEntries paginates when back option is present", () => {
    const context = loadGenerateScriptContext();
    vm.runInContext(
        `
        pages = splitMenuEntries(
            Array.from({ length: 12 }, (_, i) => ({ text: "Item" + i, target: i + 1 })),
            true
        );
        pageSizes = pages.map((page) => page.length);
    `,
        context
    );
    assert.deepEqual(Array.from(context.pageSizes), [5, 5, 2]);
});

test("generateScriptHelper adds More/Prev for long sanitized menus", () => {
    const context = loadGenerateScriptContext();
    vm.runInContext(
        `
        const items = [
            "home/α1","home/β2","home/γ3","home/δ4","home/ε5","home/ζ6","home/η7","home/θ8"
        ];
        iterateStorage = (fn) => {
            items.forEach((name, idx) => {
                fn({ type: "file", content: "X" }, name, "file", "home", idx);
            });
        };
        itemSize = 30;
        output = generateScriptHelper("home", 0);
    `,
        context
    );
    assert.match(context.output, /"More"/);
    assert.match(context.output, /"Prev"/);
});

test("generateEquationScript paginates Solve For menu when many variables", () => {
    const context = loadGenerateScriptContext();
    vm.runInContext(
        `
        lineLength = 26;
        startEquationIndex = 100;
        equationIndex = 100;
        handleSubscripts = (value) => value;
        Algebrite = { simplify: () => ({ toString: () => "A=B" }) };
        nerdamer = () => ({ text: () => "0" });
        isConstant = () => false;
        substituteVarNames = () => "0";
        item = {
            equation: "A=B",
            varEquations: { A: "B", B: "A", C: "A", D: "A", E: "A", F: "A", G: "A", H: "A" },
            varDescriptions: {},
        };
        outputEq = generateEquationScript(1, item);
        eqIndexAfter = equationIndex;
    `,
        context
    );
    assert.match(context.outputEq, /Menu\("Solve For"/);
    assert.match(context.outputEq, /"More"/);
    assert.match(context.outputEq, /"Prev"/);
    assert.ok(context.eqIndexAfter > 100);
});
