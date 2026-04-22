(function (global) {
    var loadPromise = null;
    var cachedLib = null;
    var dynamicImporter = null;
    var lastBuildCacheKey = null;
    var lastBuildBytes = null;
    var defaultReadyTimeoutMs = 60000;

    function tivarsBaseUrl() {
        var base = global.TIVARS_LIB_BASE || "lib/tivars/";
        return String(base).replace(/\/?$/, "/");
    }

    function resolveAssetUrl(fileName, baseUrl) {
        var normalized = baseUrl || tivarsBaseUrl();
        if (/^https?:\/\//i.test(normalized)) {
            return new URL(fileName, normalized).href;
        }
        if (normalized.charAt(0) === "/") {
            return new URL(fileName, location.origin + normalized).href;
        }
        return new URL(fileName, new URL(normalized, document.baseURI)).href;
    }

    function tivarsWasmModuleUrl() {
        return resolveAssetUrl("tivars_wasm.js");
    }

    function withFallbacks(primaryUrl, additionalFallbacks) {
        var urls = [primaryUrl];
        var fallbackUrls = Array.isArray(additionalFallbacks) ? additionalFallbacks : [];
        for (var i = 0; i < fallbackUrls.length; i++) {
            if (urls.indexOf(fallbackUrls[i]) === -1) {
                urls.push(fallbackUrls[i]);
            }
        }
        return urls;
    }

    function tivarsWasmCandidates() {
        var defaults = [];
        if (location.protocol === "file:") {
            defaults.push("https://cdn.jsdelivr.net/gh/adriweb/tivars_lib_cpp@master/TIVarsLib.js");
        }
        var custom = Array.isArray(global.TIVARS_WASM_FALLBACK_URLS)
            ? global.TIVARS_WASM_FALLBACK_URLS
            : [];
        return withFallbacks(tivarsWasmModuleUrl(), defaults.concat(custom));
    }

    function isTivarsReady(lib) {
        var hasLegacyApi =
            lib &&
            lib.TIVarFile &&
            lib.TIModel &&
            lib.TIVarType &&
            typeof lib.TIModel.createFromName === "function" &&
            typeof lib.TIVarType.createFromName === "function";
        var hasModernApi =
            lib &&
            lib.TIVarFile &&
            typeof lib.TIVarFile.createNew === "function" &&
            (!lib.TIModel || typeof lib.TIModel.createFromName !== "function");
        return !!(
            (hasLegacyApi || hasModernApi) &&
            lib.FS &&
            typeof lib.FS.readFile === "function"
        );
    }

    function dynamicImport(url) {
        if (typeof global.__TINOTES_DYNAMIC_IMPORT__ === "function") {
            return global.__TINOTES_DYNAMIC_IMPORT__(url);
        }
        if (dynamicImporter === null) {
            try {
                dynamicImporter = new Function("moduleUrl", "return import(moduleUrl);");
            } catch (err) {
                dynamicImporter = false;
            }
        }
        if (!dynamicImporter) {
            return Promise.reject(new Error("Dynamic import is not supported in this browser."));
        }
        try {
            return dynamicImporter(url);
        } catch (err) {
            return Promise.reject(err);
        }
    }

    function loadWasmTivars() {
        var candidates = tivarsWasmCandidates();
        function tryLoadAt(index, attempted) {
            if (index >= candidates.length) {
                throw new Error("Failed to import WASM tokenizer from: " + attempted.join(", "));
            }
            var src = candidates[index];
            attempted.push(src);
            return dynamicImport(src)
                .then(function (moduleNs) {
                    var factory =
                        global.__TINOTES_TIVARS_WASM_FACTORY__ ||
                        (moduleNs && (moduleNs.default || moduleNs.TIVarsLib));
                    if (typeof factory !== "function") {
                        throw new Error("WASM tokenizer factory export was not found.");
                    }
                    return Promise.resolve(
                        factory({
                            locateFile: function (path, prefix) {
                                var scriptBase = new URL(".", src).href;
                                var candidate = prefix || scriptBase;
                                var resolvedPath = path === "TIVarsLib.wasm" ? "tivars_wasm.wasm" : path;
                                try {
                                    return new URL(resolvedPath, candidate).href;
                                } catch (err) {
                                    return resolvedPath;
                                }
                            },
                        })
                    ).then(function (lib) {
                        if (!isTivarsReady(lib)) {
                            throw new Error(
                                "WASM tokenizer initialized without required runtime symbols."
                            );
                        }
                        return lib;
                    });
                })
                .catch(function () {
                    return tryLoadAt(index + 1, attempted);
                });
        }
        return tryLoadAt(0, []);
    }

    function loadTivars() {
        if (isTivarsReady(cachedLib)) {
            return Promise.resolve(cachedLib);
        }
        if (isTivarsReady(global.__TINOTES_TIVARS_LIB__)) {
            cachedLib = global.__TINOTES_TIVARS_LIB__;
            return Promise.resolve(cachedLib);
        }
        if (isTivarsReady(global.Module)) {
            cachedLib = global.Module;
            global.__TINOTES_TIVARS_LIB__ = cachedLib;
            return Promise.resolve(cachedLib);
        }
        if (loadPromise) {
            return loadPromise;
        }
        loadPromise = loadWasmTivars()
            .then(function (lib) {
                cachedLib = lib;
                global.__TINOTES_TIVARS_LIB__ = lib;
                global.Module = lib;
                return lib;
            })
            .catch(function (err) {
                loadPromise = null;
                var errMsg = err && err.message ? err.message : String(err);
                throw new Error(
                    "Failed to initialize tokenizer runtime (WASM-only mode). " +
                        errMsg +
                        " Serve app over http(s) if file:// blocks module or wasm loading."
                );
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
        var cacheKey = [programName, calculatorType, sourceText].join("\u0000");
        if (lastBuildCacheKey === cacheKey && lastBuildBytes instanceof Uint8Array) {
            return Promise.resolve(new Uint8Array(lastBuildBytes));
        }
        return loadTivars().then(function (lib) {
            var txt = encodeForTivars(sourceText);
            var candidates = timodelCandidates(calculatorType);
            var lastErr = null;
            var hasModernApi =
                lib &&
                lib.TIVarFile &&
                typeof lib.TIVarFile.createNew === "function" &&
                (!lib.TIModel || typeof lib.TIModel.createFromName !== "function");

            if (hasModernApi) {
                try {
                    var modernPrgm = lib.TIVarFile.createNew("Program", programName);
                    modernPrgm.setContentFromString(txt);
                    var modernTempFileName =
                        programName +
                        "_" +
                        Date.now().toString(36) +
                        "_" +
                        Math.floor(Math.random() * 1e6).toString(36);
                    var modernFilePath = modernPrgm.saveVarToFile("", modernTempFileName);
                    var modernFile = lib.FS.readFile(modernFilePath, { encoding: "binary" });
                    if (!modernFile) {
                        throw new Error("Tokenizer produced an empty file.");
                    }
                    if (modernFile.byteLength > 65525) {
                        throw new Error("Program too large to store as a single TI variable.");
                    }
                    try {
                        lib.FS.unlink(modernFilePath);
                    } catch (cleanupErr) {}
                    var modernResult = new Uint8Array(modernFile);
                    lastBuildCacheKey = cacheKey;
                    lastBuildBytes = new Uint8Array(modernResult);
                    return modernResult;
                } catch (modernErr) {
                    lastErr = modernErr;
                }
            }

            for (var i = 0; i < candidates.length; i++) {
                try {
                    var model = lib.TIModel.createFromName(candidates[i]);
                    var prgm = lib.TIVarFile.createNew(
                        lib.TIVarType.createFromName("Program"),
                        programName,
                        model
                    );
                    prgm.setContentFromString(txt);
                    var tempFileName =
                        programName +
                        "_" +
                        Date.now().toString(36) +
                        "_" +
                        Math.floor(Math.random() * 1e6).toString(36);
                    var filePath = prgm.saveVarToFile("", tempFileName);
                    var file = lib.FS.readFile(filePath, { encoding: "binary" });
                    if (!file) {
                        throw new Error("Tokenizer produced an empty file.");
                    }
                    if (file.byteLength > 65525) {
                        throw new Error("Program too large to store as a single TI variable.");
                    }
                    try {
                        lib.FS.unlink(filePath);
                    } catch (cleanupErr) {}
                    var result = new Uint8Array(file);
                    lastBuildCacheKey = cacheKey;
                    lastBuildBytes = new Uint8Array(result);
                    return result;
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
        __private: {
            tivarsWasmCandidates: tivarsWasmCandidates,
            resolveAssetUrl: resolveAssetUrl,
        },
    };
})(typeof window !== "undefined" ? window : globalThis);
