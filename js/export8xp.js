(function (global) {
    var loadPromise = null;
    var lastFilePath = null;
    var defaultReadyTimeoutMs = 15000;

    function tivarsScriptUrl() {
        var base = global.TIVARS_LIB_BASE || "lib/tivars/";
        var normalized = String(base).replace(/\/?$/, "/");
        if (/^https?:\/\//i.test(normalized)) {
            return new URL("tivars_test.js", normalized).href;
        }
        if (normalized.charAt(0) === "/") {
            return new URL("tivars_test.js", location.origin + normalized).href;
        }
        return new URL("tivars_test.js", new URL(normalized, document.baseURI)).href;
    }

    function isTivarsReady(lib) {
        return !!(
            lib &&
            lib.TIVarFile &&
            lib.TIModel &&
            lib.TIVarType &&
            lib.FS &&
            typeof lib.FS.readFile === "function" &&
            typeof lib.FS.unlink === "function"
        );
    }

    function waitForTivarsReady(lib, timeoutMs) {
        var timeout = typeof timeoutMs === "number" ? timeoutMs : defaultReadyTimeoutMs;
        var start = Date.now();
        return new Promise(function (resolve, reject) {
            function tick() {
                if (isTivarsReady(lib)) {
                    resolve(lib);
                    return;
                }
                // Emscripten data preload uses these counters.
                if (
                    lib &&
                    typeof lib.expectedDataFileDownloads === "number" &&
                    typeof lib.finishedDataFileDownloads === "number" &&
                    lib.finishedDataFileDownloads < lib.expectedDataFileDownloads
                ) {
                    // keep waiting
                }
                if (Date.now() - start > timeout) {
                    reject(
                        new Error(
                            "Tokenizer loaded but filesystem is not ready (Module.FS missing). " +
                                "This often means the tivars data file failed to download."
                        )
                    );
                    return;
                }
                setTimeout(tick, 25);
            }
            tick();
        });
    }

    function loadTivars() {
        if (isTivarsReady(global.Module)) {
            return Promise.resolve(global.Module);
        }
        if (loadPromise) {
            return loadPromise;
        }
        loadPromise = new Promise(function (resolve, reject) {
            var script = document.createElement("script");
            script.src = tivarsScriptUrl();
            script.async = true;
            script.onload = function () {
                if (!global.Module || !global.Module.TIVarFile) {
                    loadPromise = null;
                    reject(new Error("TIVars library did not initialize (TIVarFile missing)."));
                    return;
                }
                waitForTivarsReady(global.Module)
                    .then(resolve)
                    .catch(function (err) {
                        loadPromise = null;
                        reject(err);
                    });
            };
            script.onerror = function () {
                loadPromise = null;
                reject(new Error("Failed to load tokenizer from " + script.src));
            };
            document.head.appendChild(script);
        });
        return loadPromise;
    }

    function timodelCandidates(calculatorType) {
        if (calculatorType === "color") {
            return ["83PCE", "84+CE", "84+CSE"];
        }
        return ["84+", "83+", "82A", "83"];
    }

    function encodeForTivars(sourceText) {
        return unescape(encodeURIComponent(sourceText));
    }

    function build8xp(programName, sourceText, calculatorType) {
        return loadTivars().then(function (lib) {
            var txt = encodeForTivars(sourceText);
            var candidates = timodelCandidates(calculatorType);
            var lastErr = null;

            for (var i = 0; i < candidates.length; i++) {
                try {
                    var model = lib.TIModel.createFromName(candidates[i]);
                    var prgm = lib.TIVarFile.createNew(
                        lib.TIVarType.createFromName("Program"),
                        programName,
                        model
                    );
                    prgm.setContentFromString(txt);
                    if (lastFilePath !== null) {
                        try {
                            lib.FS.unlink(lastFilePath);
                        } catch (unlinkErr) {}
                        lastFilePath = null;
                    }
                    var filePath = prgm.saveVarToFile("", programName);
                    lastFilePath = filePath;
                    var file = lib.FS.readFile(filePath, { encoding: "binary" });
                    if (!file) {
                        throw new Error("Tokenizer produced an empty file.");
                    }
                    if (file.byteLength > 65525) {
                        throw new Error("Program too large to store as a single TI variable.");
                    }
                    return new Uint8Array(file);
                } catch (err) {
                    lastErr = err;
                }
            }
            throw lastErr || new Error("Unable to tokenize program for any supported calculator model.");
        });
    }

    function downloadBinary(filename, bytes) {
        var blob = new Blob([bytes], { type: "application/octet-stream" });
        var url = URL.createObjectURL(blob);
        var anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    }

    global.TINotesExport8xp = {
        loadTivars: loadTivars,
        build8xp: build8xp,
        downloadBinary: downloadBinary,
    };
})(typeof window !== "undefined" ? window : globalThis);
