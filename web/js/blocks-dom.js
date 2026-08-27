const blocksBox = document.getElementById("blocks-box");

// トップレベルのブロックのうち、指定Y座標より下にある最初の要素を返す
// （ドロップした高さに応じて、縦積みの並びの中の適切な位置に挿入するため）
function getTopLevelBlockBelow(y) {
    const topLevelBlocks = Array.from(blocksBox.children).filter(el =>
        el.classList.contains("block") || el.classList.contains("control-block")
    );
    return topLevelBlocks.find(el => el.getBoundingClientRect().top > y) || null;
}

function isTopLevelBlock(el) {
    return !!el && el.parentElement === blocksBox &&
        (el.classList.contains("block") || el.classList.contains("control-block"));
}

export { blocksBox, getTopLevelBlockBelow, isTopLevelBlock };
