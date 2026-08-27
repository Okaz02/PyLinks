// ブロックツリーをPythonコードに変換し、変更のたびにconsole.logへ出力する

let pywebviewReady = !!window.pywebview;
window.addEventListener('pywebviewready', () => { pywebviewReady = true; }, { once: true });

const blocksBox = document.getElementById("blocks-box");

function indent(depth) {
    return "    ".repeat(depth);
}

// segment-inputのテキストと、間に挟まったfunction-chip(埋め込みブロック)を
// 元の並び順のまま連結する
function textContainerToCode(container) {
    return Array.from(container.children).map(child => {
        if (child.classList.contains("segment-input")) return child.value;
        if (child.classList.contains("function-chip")) return blockToCode(child);
        return "";
    }).join("");
}

// block-slide / control-block-header-content 直下の label・input・checked-block を
// 順番に読んでコード片をスペース区切りで連結する
function slideToCode(slideEl) {
    if (!slideEl) return "";
    const parts = Array.from(slideEl.children).map(child => {
        if (child.classList.contains("block-label")) return child.textContent.trim();
        if (child.classList.contains("input-text-container")) return textContainerToCode(child);
        if (child.classList.contains("checked-block")) {
            const warp = child.querySelector(":scope > .input-text-container");
            return warp ? textContainerToCode(warp) : "";
        }
        return "";
    });
    return parts.join(" ").replace(/\s+/g, " ").trim();
}

// importはblock-slideの最初のモジュール名に加え、「add」ボタンで.block直下に
// 追加された.delete要素(2つ目以降のモジュール)を集めてimport文にする
function importBlockToCode(block) {
    const modules = [];
    const firstChecked = block.querySelector(":scope > .block-slide > .checked-block");
    if (firstChecked) {
        const warp = firstChecked.querySelector(":scope > .input-text-container");
        if (warp) modules.push(textContainerToCode(warp));
    }
    block.querySelectorAll(":scope > .delete > .checked-block").forEach(checked => {
        const warp = checked.querySelector(":scope > .input-text-container");
        if (warp) modules.push(textContainerToCode(warp));
    });
    return `import ${modules.filter(Boolean).join(", ")}`;
}

function blockToCode(block) {
    if (block.getModuleName === "builtins" && block.getFuncName === "__import__") return importBlockToCode(block);
    return slideToCode(block.querySelector(":scope > .block-slide"));
}

// control-blockはヘッダーをそのまま「見出し行 + ':'」とし、
// control-block-body-content内の子ブロックを1段深くインデントして並べる
function controlBlockToCode(control, depth) {
    const header = control.querySelector(":scope > .control-block-header > .control-block-header-content");
    const headLine = `${indent(depth)}${slideToCode(header)}`;

    const bodyContent = control.querySelector(":scope > .control-block-body > .control-block-body-content");
    const bodyBlocks = bodyContent
        ? Array.from(bodyContent.children).filter(el => el.classList.contains("block") || el.classList.contains("control-block"))
        : [];

    if (bodyBlocks.length === 0) {
        return [headLine, `${indent(depth + 1)}pass`];
    }
    return [headLine, ...bodyBlocks.flatMap(el => elementToLines(el, depth + 1))];
}

function elementToLines(el, depth = 0) {
    if (el.classList.contains("control-block")) return controlBlockToCode(el, depth);
    return [`${indent(depth)}${blockToCode(el)}`];
}

function generateCode() {
    const topLevel = Array.from(blocksBox.children).filter(el =>
        el.classList.contains("block") || el.classList.contains("control-block")
    );
    return topLevel.flatMap(el => elementToLines(el, 0)).join("\n");
}

let scheduled = false;
function scheduleLog() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
        scheduled = false;
        console.log(generateCode());
    }, 100);
}

new MutationObserver(scheduleLog).observe(blocksBox, {
    childList: true,
    subtree: true,
    characterData: true,
});
blocksBox.addEventListener("input", scheduleLog);

scheduleLog();

// --- File > Export ---
// 現在のブロックツリーから生成したPythonコードを、ネイティブの保存ダイアログで
// 選んだ .py ファイルに書き出す
document.getElementById("menu-export")?.addEventListener("click", async (e) => {
    if (!pywebviewReady) return;

    const result = await pywebview.api.save_python_file_dialog(generateCode());
    if (result?.error) {
        console.error(`Export failed: ${result.error}`);
    }
    e.target.closest("details")?.removeAttribute("open");
});
