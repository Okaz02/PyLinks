const blocksBox = document.getElementById("blocks-box");

// ブロックの入れ物として振る舞う要素かどうか
// (トップレベルのblocks-box自身、またはコントロールブロックの本体)
function isBlockContainer(el) {
    return el === blocksBox || !!el?.classList?.contains("control-block-body-content");
}

// ドラッグ中のポインタ位置から、実際にブロックを差し込むべき入れ物を求める。
// コントロールブロックの本体の上にいればその本体、それ以外はトップレベル(blocksBox)
function findBlockContainerAt(target) {
    return target?.closest?.(".control-block-body-content") || blocksBox;
}

// 指定した入れ物の直下にあるブロックのうち、指定Y座標より下にある最初の要素を返す
// （ドロップした高さに応じて、縦積みの並びの中の適切な位置に挿入するため）
function getBlockBelow(container, y) {
    const blocks = Array.from(container.children).filter(el =>
        el.classList.contains("block") || el.classList.contains("control-block")
    );
    return blocks.find(el => el.getBoundingClientRect().top > y) || null;
}

// blocks-box、またはいずれかのコントロールブロックの本体に直接配置されているブロックか
// (入力欄に埋め込まれたfunction-chip等はここではfalseになる)
function isPlacedBlock(el) {
    return !!el && isBlockContainer(el.parentElement) &&
        (el.classList.contains("block") || el.classList.contains("control-block"));
}

export { blocksBox, isBlockContainer, findBlockContainerAt, getBlockBelow, isPlacedBlock };
