const generateScriptBtn = document.getElementById("generateScriptBtn");
generateScriptBtn.addEventListener("click", () => {
    prepareScriptForExport({ exportRoot: homePosition });
    openExportScriptModal();
});
const download8xpBtn = document.getElementById("download8xpBtn");
const downloadScriptBtn = document.getElementById("downloadScriptBtn");
const copyScriptBtn = document.getElementById("copyScriptBtn");
const defaultScriptFormat = "sourceCoder";
let script;
let itemSize = calculateItemSize();
let startEquationIndex;
let equationIndex;
let exportSanitizationReport;
let hasShownSanitizationWarning = false;
let isBuilding8xp = false;
let hasPreloaded8xpTokenizer = false;
const maxMenuOptions = 7;
/** TI program basename (letters A–Z / digits only, max length 8) used for downloads and tokenizer. */
let tinotesExportProgramBaseName = "TINOTES";
/** Storage path root for navigation script (normally `home`; a folder path for subtree export). */
let scriptExportRoot = "home";
/** Base path for shortening menu titles in generated TI strings. */
let scriptTitleBasePosition = "home";

function sanitizeTiProgramName(name) {
    if (typeof name !== "string" || name.trim() === "") {
        return "TINOTES";
    }
    const cleaned = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const base = cleaned.length === 0 ? "TN" : cleaned;
    return base.length > 8 ? base.slice(0, 8) : base;
}

function isUnderExportSubtree(itemPath, rootPath) {
    if (
        typeof itemPath !== "string" ||
        typeof rootPath !== "string" ||
        rootPath.length === 0
    ) {
        return false;
    }
    return itemPath === rootPath || itemPath.startsWith(rootPath + "/");
}
downloadScriptBtn.addEventListener("click", () => {
    prepareScriptForExport({ forceWarning: true, keepCurrentExportScope: true });
    download(`${tinotesExportProgramBaseName}.txt`, script);
});
if (download8xpBtn) {
    download8xpBtn.addEventListener("click", () => {
        if (isBuilding8xp) {
            return;
        }
        prepareScriptForExport({ forceWarning: true, keepCurrentExportScope: true });
        const text = script;
        isBuilding8xp = true;
        download8xpBtn.classList.add("btn-disabled");
        const enable8xpBtn = () => {
            isBuilding8xp = false;
            download8xpBtn.classList.remove("btn-disabled");
        };
        TINotesExport8xp.build8xp(tinotesExportProgramBaseName, text, calculatorType)
            .then((bytes) => {
                TINotesExport8xp.downloadBinary(`${tinotesExportProgramBaseName}.8xp`, bytes);
                swal({
                    title: `Saved ${tinotesExportProgramBaseName}.8xp`,
                    text: "Send the file with TI Connect or your usual link software.",
                    icon: "success",
                    buttons: false,
                    timer: 1400,
                });
                enable8xpBtn();
            })
            .catch((err) => {
                swal({
                    title: "Could not build .8xp",
                    text: (err && err.message ? err.message : String(err)) +
                        "\n\nTry Download .txt and compile with SourceCoder or TI Connect.",
                    icon: "error",
                    button: "OK",
                });
                enable8xpBtn();
            });
    });
}

if (generateScriptBtn && TINotesExport8xp && typeof TINotesExport8xp.loadTivars === "function") {
    generateScriptBtn.addEventListener("click", () => {
        if (hasPreloaded8xpTokenizer) {
            return;
        }
        hasPreloaded8xpTokenizer = true;
        TINotesExport8xp.loadTivars().catch(() => {
            // Keep UI responsive; click-path export will show a user-facing error if this still fails.
            hasPreloaded8xpTokenizer = false;
        });
    });
}
copyScriptBtn.addEventListener("click", () => {
    /* Select the text field */
    document.getElementById("viewer").select();
    /* Copy the text inside the text field */
    document.execCommand("copy");
    swal({
        title: "File Copied!",
        icon: "success",
        buttons: false,
        timer: 800,
    });
});

function calculateItemSizeSubtree(rootPath) {
    let size = 0;
    iterateStorage(function (item, itemName) {
        if (!isUnderExportSubtree(itemName, rootPath)) {
            return;
        }
        size += 1;
    });
    size++;
    return size;
}

function calculateItemSize(rootPath) {
    const root =
        typeof rootPath === "string" && rootPath.length > 0 ? rootPath : "home";
    return calculateItemSizeSubtree(root);
}

function calculateFolderSizeSubtree(rootPath) {
    let folderSize = 0;
    iterateStorage(function (item, itemName, itemType) {
        if (itemType !== "folder") {
            return;
        }
        if (!isUnderExportSubtree(itemName, rootPath)) {
            return;
        }
        folderSize += 1;
    });
    return folderSize;
}

function calculateFolderSize(rootPath) {
    const root =
        typeof rootPath === "string" && rootPath.length > 0 ? rootPath : "home";
    return calculateFolderSizeSubtree(root);
}

function calculateEquationVarSizeSubtree(rootPath) {
    let varSize = 0;
    iterateStorage(function (item, itemName, itemType) {
        if (itemType !== "equation") {
            return;
        }
        if (!isUnderExportSubtree(itemName, rootPath)) {
            return;
        }
        varSize += Object.keys(item.varEquations || {}).length;
    });
    return varSize;
}

function calculateEquationVarSize(rootPath) {
    const root =
        typeof rootPath === "string" && rootPath.length > 0 ? rootPath : "home";
    return calculateEquationVarSizeSubtree(root);
}

function openExportScriptModal() {
    const popupBody = document.querySelector('#popup div.modal-body');
    let viewer = document.getElementById("viewer")
    if (viewer) {
        viewer.remove();
    }
    viewer = createFileEditor("viewer");
    viewer.value = script;
    viewer.readOnly = true;
    const scriptFormatSelector = document.getElementById("scriptFormatSelector");
    popupBody.insertBefore(viewer, scriptFormatSelector);

    // file type options
    document.querySelectorAll('input[name="scriptFormat"]')
        .forEach((el) => {
            el.addEventListener("change", (e) => {
                scriptFormat = e.target.value;
                // console.log('TCL: exportScript -> scriptFormat', scriptFormat);
                changeScriptFormat(scriptFormat);
            })
        });


    showSanitizationWarningIfNeeded();
}

function prepareScriptForExport(options = {}) {
    const forceWarning = !!options.forceWarning;
    if (typeof options.exportRoot === "string") {
        generateScript({ exportRoot: options.exportRoot });
    } else if (options.keepCurrentExportScope) {
        generateScript({ exportRoot: scriptExportRoot });
    } else {
        generateScript({ exportRoot: homePosition });
    }
    changeScriptFormat(defaultScriptFormat);
    // Normalize line endings for downloads/tokenizers.
    script = script.replace(/\n/g, "\r\n");
    if (forceWarning) {
        hasShownSanitizationWarning = false;
    }
}

function changeScriptFormat(scriptFormat) {
    // convert between cemetech's SourceCoder format and TI-BASIC's native format
    const conversionTable = {
        // left is TI-BASIC format (used by TI Connect CE), right is SourceCoder format
        "→": "->",
        "⌊": "|L", // left side should be a small capital "L", but is is technically an unicode "left floor"
        "≠": "!=",
    }
    switch (scriptFormat) {
        case "sourceCoder":
            // console.log('TCL: changeScriptFormat -> scriptFormat', scriptFormat);
            Object.entries(conversionTable).forEach(([key, value]) => {
                // console.log('TCL: changeScriptFormat -> value', value);
                // console.log('TCL: changeScriptFormat -> key', key);
                script = script.replace(new RegExp(RegExp.escape(key), "g"), value);
            })
            script = convertSymbolsToWords(script);
            break;
        case "TIBasic":
            Object.entries(conversionTable).forEach(([key, value]) => {
                // console.log('TCL: changeScriptFormat -> value', value);
                // console.log('TCL: changeScriptFormat -> key', key);
                script = script.replace(new RegExp(RegExp.escape(value), "g"), key);
            })
            script = convertWordsToSymbols(script);
            break;
    }
    // console.log('TCL: changeScriptFormat -> script', script);
    // update the viewer with new script
    let viewer = document.getElementById("viewer");
    if (viewer) {
        viewer.value = script;
    }
}

function selectAllItems() {

}

function generateScript(options = {}) {
    const requestedRoot =
        typeof options.exportRoot === "string" ? options.exportRoot.trim() : "";
    scriptExportRoot =
        requestedRoot.length > 0 && isUnderExportSubtree(requestedRoot, homePosition)
            ? requestedRoot
            : homePosition;
    scriptTitleBasePosition =
        scriptExportRoot === homePosition ? homePosition : scriptExportRoot;

    tinotesExportProgramBaseName =
        scriptExportRoot === homePosition
            ? "TINOTES"
            : sanitizeTiProgramName(
                  scriptExportRoot.substring(scriptExportRoot.lastIndexOf("/") + 1)
              );

    // selectAllItems();
    itemSize = calculateItemSize(scriptExportRoot); // reset item size
    const folderSize = calculateFolderSize(scriptExportRoot); // all folders have "back" button which need labels
    const equationVarSize = calculateEquationVarSize(scriptExportRoot);
    startEquationIndex = itemSize + folderSize + 1;
    equationIndex = startEquationIndex;
    exportSanitizationReport = createSanitizationReport();
    script = `0->N\n1->W\nLbl S\n`; // initialize variables
    // initiate equation var list
    if (equationVarSize > 0) {
        script += `{0${",0".repeat(equationVarSize - 1)}}->|LV\n`;
    }
    script += generateScriptHelper(scriptExportRoot, 0);
    script += `${baseScript}`;
}

function generateScriptHelper(position, index) {
    // console.log('TCL: generateScriptHelper -> index', index);
    // console.log('TCL: generateScriptHelper -> position', position);
    let homeMenu = `If N=${index}\nThen\nN->|LA(W)\n`;
    let branching = ``;
    const menuEntries = [];
    iterateStorage(function (item, itemName, itemType, itemPosition, index) {
        if (itemPosition === position) {
            index++;
            menuEntries.push({
                text: sanitizeSourceCoderString(
                    getEndOfActivePosition(itemName, scriptTitleBasePosition),
                    `menu item: ${itemName}`
                ),
                target: index,
            });
            if (itemType === `file`) {
                branching += generateFileScript(index, item.content);
            } else if (itemType === `equation`) {
                branching += generateEquationScript(index, item);
            } else {
                branching += generateScriptHelper(itemName, index);
            }
        }
    });

    const sanitizedTitle = sanitizeSourceCoderString(
        getEndOfActivePosition(position, scriptTitleBasePosition),
        `menu title: ${position}`
    );
    const menuPages = splitMenuEntries(menuEntries, position !== scriptExportRoot);
    const pageLabels = menuPages.map(() => itemSize++);
    menuPages.forEach((pageEntries, pageIndex) => {
        const pageLabel = pageLabels[pageIndex];
        const hasPrevious = pageIndex > 0;
        const hasNext = pageIndex < menuPages.length - 1;
        let pageMenu = `Lbl ${pageLabel}\nMenu("${sanitizedTitle}"`;
        pageEntries.forEach((entry) => {
            pageMenu += `,"${entry.text}",${entry.target}`;
        });
        if (hasPrevious) {
            pageMenu += `,"Prev",${pageLabels[pageIndex - 1]}`;
        }
        if (hasNext) {
            pageMenu += `,"More",${pageLabels[pageIndex + 1]}`;
        }
        if (position !== scriptExportRoot) {
            pageMenu += `,"Back",${itemSize}`;
        }
        pageMenu += `)\n`;
        homeMenu += pageMenu;
    });

    const indexList = menuEntries.map((entry) => entry.target);
    if (position !== scriptExportRoot) { // not at export root
        homeMenu += `Lbl ${itemSize}\n`;
        homeMenu += `W-1->W\n|LA(W)->N\nGoto S\n`;
        itemSize++;
    }
    indexList.forEach(
        (index, len) => {
            homeMenu += `Lbl ${index}\n`;
            if (len > 0) {
                homeMenu += `If `;
                for (let i = 0; i < len; i++) {
                    if (i > 0) {
                        homeMenu += ` and `;
                    }
                    homeMenu += `N!=${indexList[i]}`;
                }
                homeMenu += `\n`;
            }
            homeMenu += `${index}->N\n`;
        }
    )
    homeMenu += `W+1->W\nEnd\n`;
    script = `${homeMenu}\n${branching}`;
    return script;
}

function splitMenuEntries(entries, includeBackOption) {
    const safeEntries = entries || [];
    const singlePageCapacity = includeBackOption ? maxMenuOptions - 1 : maxMenuOptions;
    if (safeEntries.length <= singlePageCapacity) {
        return [safeEntries];
    }
    const pagedCapacity = includeBackOption ? maxMenuOptions - 2 : maxMenuOptions - 1;
    const pageSize = Math.max(1, pagedCapacity);
    const pages = [];
    for (let i = 0; i < safeEntries.length; i += pageSize) {
        pages.push(safeEntries.slice(i, i + pageSize));
    }
    return pages;
}

function convertEquationToTIFormat(equation){
    equation = equation
    .replace(/\^\s*([2-3]|-1)($|[^0-9])/g, "^^$1$2") // superscript for ^2, ^3, and ^-1 powers
    .replace(/\_/g, ""); // no subscript in TI so I can only delete the underscore
    return equation;
}

function simplifyEquation(equation){
    let eq;
    if (equation.indexOf("=") >= 0){
        eqSegments = equation.split("=");
        eq = simplifyEquation(eqSegments[0]) + "=" + simplifyEquation(eqSegments.slice(1).join(""));
    } else{
        eq = Algebrite.simplify(equation).toString();
    }
    return eq.replace(/ /g,"");
}

function generateEquationScript(index, item) {
    const eq = convertEquationToTIFormat(simplifyEquation(item.equation));
    const varEquations = item.varEquations;
    console.log('TCL: generateEquationScript -> vars', varEquations);
    const userVarNames = Object.keys(varEquations);
    const userVarDescriptions = item.varDescriptions;
    const varLength = userVarNames.length;
    console.log('TCL: generateEquationScript -> varLength', varLength);
    const tiVarNames = [];
    const startIndex = equationIndex;
    const endIndex = equationIndex + varLength;
    for (let i = startIndex; i < endIndex; i++) {
        // LV is a list in ti-basic where "L" is the command for denoting
        // a custom list and "V" is the name of the list and stands for
        // "variable"
        if (startIndex === startEquationIndex) {
            tiVarNames.push(`LV${i - startEquationIndex + 1}`);
        } else {
            tiVarNames.push(`LV${i - startEquationIndex}`);
        }
    }
    console.log('TCL: generateEquationScript -> varNames', userVarNames);
    let str = `If N=${index}\nThen\n`;
    // display equation and initiate variables
    str += `Disp "${sanitizeSourceCoderString(eq, `equation display: ${index}`)}"\nPause \n${equationIndex - 1}->L\nN->|LA(W)\n`;
    // add menu
    let menu = ``; // paged menus emitted below
    let conversion = ``;
    let prompt = ``;
    let solution = ``;
    const variableMenuEntries = [];
    for (let label = startIndex; label < endIndex; label++) {
        const userVarName = userVarNames[label - startIndex];
        const userVarDescription = userVarDescriptions[userVarName];
        let tiVarNameIndex;
        if (startIndex === startEquationIndex) {
            tiVarNameIndex = label - startEquationIndex + 1;
        } else {
            tiVarNameIndex = label - startEquationIndex;
        }
        const tiVarName = `|LV(${tiVarNameIndex})`;
        let varEquation = varEquations[userVarName];
        // remove parentheses around subscripts to ensure valid variable names
        varEquation = handleSubscripts(varEquations[userVarName], false);
        const tiVarEquation = substituteVarNames(varEquation, userVarNames, tiVarNames);
        console.log('TCL: generateEquationScript -> varEquation', varEquation);
        if (isConstant(varEquation)) { // var is a constant
            console.log('TCL: generateEquationScript -> varEquation' + varEquation + ' is finite');
            prompt += `${tiVarEquation}->${tiVarName}\n`;
        } else { // var is a true variable
            // add menu item (equation variables)
            const menuText = userVarDescription
                ? sanitizeSourceCoderString(`${userVarName}-${userVarDescription}`, `equation var description: ${userVarName}`)
                : sanitizeSourceCoderString(userVarName, `equation var name: ${userVarName}`);
            variableMenuEntries.push({ text: menuText, target: label });
            // prompt values for known variables
            prompt += `If (L!=${label})\nThen\nInput "${sanitizeSourceCoderString(userVarName, `equation prompt: ${userVarName}`)}=",T\n`;
            // use T as a temporary variable (input doesn't accept L1(2) syntax)
            prompt += `T->${tiVarName}\nEnd\n`;
            // calculate and display the solution
            solution += `If L=${label}\nThen\n"${sanitizeSourceCoderString(userVarName, `equation solution label: ${userVarName}`)}="->Str2\n${tiVarEquation}->V\nEnd\n`;
        }
        // convert menu item's label to number
        conversion += `Lbl ${startIndex - 1 + endIndex - label}:L+1->L\n`;
    }

    const menuPages = splitMenuEntries(variableMenuEntries, false);
    const equationMenuLabels = menuPages.map(() => equationIndex++);
    menuPages.forEach((pageEntries, pageIndex) => {
        const pageLabel = equationMenuLabels[pageIndex];
        const hasPrevious = pageIndex > 0;
        const hasNext = pageIndex < menuPages.length - 1;
        let pageMenu = `Lbl ${pageLabel}\nMenu("Solve For"`;
        pageEntries.forEach((entry) => {
            pageMenu += `,"${entry.text}",${entry.target}`;
        });
        if (hasPrevious) {
            pageMenu += `,"Prev",${equationMenuLabels[pageIndex - 1]}`;
        }
        if (hasNext) {
            pageMenu += `,"More",${equationMenuLabels[pageIndex + 1]}`;
        }
        pageMenu += `)\n`;
        menu += pageMenu;
    });
    // convert result from number to string for display
    solution += `{0,.5,1->L1\nVL1->L2\nMed-Med {Y1}\nEqu>String({Y1},Str1\nsub(Str1,1,length(Str1)-3->Str1\n`;
    // clean up unused variables from the routine
    solution += `DelVar L1DelVar L2DelVar {Y1}\n`;
    solution += `Disp Str2+Str1\n`;
    // display a division line at end of solution
    solution += `Disp "`;
    for (let i = 0; i < lineLength; i++) {
        solution += "~";
    }
    solution += `"\n`;
    // press 2nd key to go back to parent folder
    let back = `Lbl theta
    0->K
    Repeat K=21 or K=105 or K=45
        getKey->K
    End
    V
    If K=21
    Then
        W-1->W
        |LA(W)->N
        Goto S
    End
    If K=105
    Then
        Input "",Str0
        expr(Str0)->V
        Disp V
        Disp "~~~~~~~~~~~~~~~~~~~~~~~~~~"
        Goto theta
    End
    If K=45
	Then
		Stop
	End\n`;
    str += menu + conversion + prompt + solution + back;
    str += "End\n" // pause to let user see solution
    // increase equationIndex
    equationIndex += varLength + 1;
    return str;
}

function substituteVarNames(equation, oldVarNames, newVarNames) {
    const varMap = {};
    for (let i = 0; i < oldVarNames.length; i++) {
        varMap[oldVarNames[i]] = newVarNames[i];
    }
    let newEquation = handleScientificNotations(nerdamer(equation, varMap).text("decimals"));
    // add in sourcecoder notation of a list
    newEquation = newEquation.replace(/LV([0-9]+)/g, "|LV($1)");
    newEquation = convertMinusesToNegations(newEquation);
    return newEquation;
}

// replacing lowercase e with uppercase E for scientific notations
// (TI only accepts uppercase E)
function handleScientificNotations(equation){
    const scientificNotationRegex = /([+\-]?(?:0|[1-9]\d*)(?:\.\d*)?)(?:e([+\-]?\d+))/g;
    // E for exponentiation is different from E the variable name!!! need a | before E!!!
    return equation.replace(scientificNotationRegex, "$1|E$2");
}

function convertMinusesToNegations(eq) {
    if (eq[0] === "-") {
        eq = "~" + eq.substring(1);
    }
    eq = eq.replace(/\(\-/g, "(~");
    eq = eq.replace(/\|E-/g, "|E~");
    return eq;
}

function generateFileScript(index, content) {
    return `If N=${index}\n"${sanitizeSourceCoderString(content, `file content: ${index}`)}"->Str1\n`;
}

function createSanitizationReport() {
    return {
        totalReplacements: 0,
        touchedContexts: new Set(),
        replacementCounts: {},
    };
}

function addSanitizationReplacement(originalChar, replacementText, context) {
    if (!exportSanitizationReport) {
        exportSanitizationReport = createSanitizationReport();
    }
    exportSanitizationReport.totalReplacements += 1;
    exportSanitizationReport.touchedContexts.add(context);
    const replacementKey = `${originalChar}->${replacementText}`;
    exportSanitizationReport.replacementCounts[replacementKey] = (exportSanitizationReport.replacementCounts[replacementKey] || 0) + 1;
}

function sanitizeSourceCoderString(input, context = "unknown context") {
    if (typeof input !== "string" || input.length === 0) {
        return "";
    }
    const directReplacements = {
        // Common typography → ASCII
        "“": '"',
        "”": '"',
        "„": '"',
        "‟": '"',
        "’": "'",
        "‘": "'",
        "‚": "'",
        "‛": "'",
        "—": "-",
        "–": "-",
        "−": "-",
        "…": "...",
        "•": "*",
        "·": "*",
        "∙": "*",
        "×": "*",
        "÷": "/",
        "≠": "!=",
        "≤": "<=",
        "≥": ">=",
        "≈": "~=",
        "≃": "~=",
        "≅": "~=",
        "∞": "inf",
        "°": "deg",
        "º": "deg",
        "∠": "angle",
        "√": "sqrt(",
        // NBSP / spaces
        "\u00A0": " ",

        // Greek letters → words (lowercase)
        "α": "alpha",
        "β": "beta",
        "γ": "gamma",
        "δ": "delta",
        "ε": "epsilon",
        "ϵ": "epsilon",
        "ζ": "zeta",
        "η": "eta",
        "θ": "theta",
        "ϑ": "theta",
        "ι": "iota",
        "κ": "kappa",
        "λ": "lambda",
        "μ": "mu",
        "ν": "nu",
        "ξ": "xi",
        "ο": "omicron",
        "π": "pi",
        "ρ": "rho",
        "ϱ": "rho",
        "σ": "sigma",
        "ς": "sigma",
        "τ": "tau",
        "υ": "upsilon",
        "φ": "phi",
        "ϕ": "phi",
        "χ": "chi",
        "ψ": "psi",
        "ω": "omega",

        // Greek letters → words (uppercase)
        "Α": "Alpha",
        "Β": "Beta",
        "Γ": "Gamma",
        "Δ": "Delta",
        "Ε": "Epsilon",
        "Ζ": "Zeta",
        "Η": "Eta",
        "Θ": "Theta",
        "Ι": "Iota",
        "Κ": "Kappa",
        "Λ": "Lambda",
        "Μ": "Mu",
        "Ν": "Nu",
        "Ξ": "Xi",
        "Ο": "Omicron",
        "Π": "Pi",
        "Ρ": "Rho",
        "Σ": "Sigma",
        "Τ": "Tau",
        "Υ": "Upsilon",
        "Φ": "Phi",
        "Χ": "Chi",
        "Ψ": "Psi",
        "Ω": "Omega",

        // Subscripts / superscripts → ASCII
        "₀": "0",
        "₁": "1",
        "₂": "2",
        "₃": "3",
        "₄": "4",
        "₅": "5",
        "₆": "6",
        "₇": "7",
        "₈": "8",
        "₉": "9",
        "⁰": "0",
        "¹": "1",
        "²": "2",
        "³": "3",
        "⁴": "4",
        "⁵": "5",
        "⁶": "6",
        "⁷": "7",
        "⁸": "8",
        "⁹": "9",
        "⁻": "-",

        // Unicode replacement char should never survive.
        "�": "",
    };
    let sanitized = "";
    // Decompose diacritics (é → e + ◌́) so we can drop marks instead of '?'
    const normalizedInput = typeof input.normalize === "function" ? input.normalize("NFKD") : input;
    for (const char of normalizedInput) {
        if (directReplacements[char] !== undefined) {
            const replacement = directReplacements[char];
            sanitized += replacement;
            addSanitizationReplacement(char, replacement, context);
            continue;
        }
        // Strip combining marks introduced by NFKD (accents, etc).
        if (/[\p{M}]/u.test(char)) {
            addSanitizationReplacement(char, "", context);
            continue;
        }
        // Strip zero-width / BOM characters.
        if (/[\u200B-\u200D\uFEFF]/u.test(char)) {
            addSanitizationReplacement(char, "", context);
            continue;
        }
        const code = char.codePointAt(0);
        if (code >= 32 && code <= 126) {
            sanitized += char;
            continue;
        }
        sanitized += "?";
        addSanitizationReplacement(char, "?", context);
    }
    return sanitized;
}

function showSanitizationWarningIfNeeded() {
    if (!exportSanitizationReport || exportSanitizationReport.totalReplacements === 0) {
        hasShownSanitizationWarning = false;
        return;
    }
    if (hasShownSanitizationWarning) {
        return;
    }
    const replacementSummary = Object.entries(exportSanitizationReport.replacementCounts)
        .map(([key, count]) => `${key} (${count})`)
        .slice(0, 6)
        .join(", ");
    const touchedContextCount = exportSanitizationReport.touchedContexts.size;
    const warningText = `Normalized ${exportSanitizationReport.totalReplacements} unsupported character(s) across ${touchedContextCount} string section(s). Replacements: ${replacementSummary}`;
    console.warn(`[TINotes Export] ${warningText}`);
    swal({
        title: "Export normalized text",
        text: warningText,
        icon: "warning",
        button: "OK",
    });
    hasShownSanitizationWarning = true;
}

// Source: https://ourcodeworld.com/articles/read/189/how-to-create-a-file-and-generate-a-download-with-javascript-in-the-browser-without-a-server
// Start downloading a file in browser
function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

/**
 * Right-click Export: build a TI program from this folder and subfolders only.
 * Depends on globals from script.js: homePosition, getItemFromStorage.
 */
function openExportScriptForFolderPath(folderStoragePath) {
    if (
        typeof folderStoragePath !== "string" ||
        folderStoragePath.length === 0 ||
        folderStoragePath === homePosition ||
        typeof getItemFromStorage !== "function"
    ) {
        return;
    }
    const meta = getItemFromStorage(folderStoragePath);
    if (!meta || meta.type !== "folder") {
        return;
    }
    prepareScriptForExport({ exportRoot: folderStoragePath });
    openExportScriptModal();
    const popup = document.getElementById("popup");
    if (popup) {
        popup.style.display = "block";
    }
}