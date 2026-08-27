import { blocksData } from '../block/blocks.js';

let pywebviewReady = !!window.pywebview;
window.addEventListener('pywebviewready', () => { pywebviewReady = true; }, { once: true });

const toolsBox = document.getElementById("tools-box");
const toolsBoxInput = document.getElementById("tools-box-input");
const toolsBoxBody = document.getElementById("tools-box-body");

document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    toolsBox.style.top = `${event.clientY}px`;
    toolsBox.style.left = `${event.clientX}px`;
});

toolsBoxInput.addEventListener("input", async () => {
    if (!pywebviewReady) return;

    const moduleInputs = document.querySelectorAll('[data-system="import_module"]');
    const moduleNames = Array.from(moduleInputs)
        .map(input => input.getValue().value)
        .filter(Boolean);

    const query = toolsBoxInput.value;
    const functions = await pywebview.api.search_functions(["builtins", ...moduleNames], query);

    toolsBoxBody.innerHTML = "";

    if (query) {
        const matchedBlocks = blocksData.blocks.filter(blockData =>
            (blockData.name ?? "").toLowerCase().includes(query.toLowerCase())
        );

        if (matchedBlocks.length) {
            const details = document.createElement("details");
            details.className = "tools-box-group";

            const summary = document.createElement("summary");
            summary.textContent = `blocks (${matchedBlocks.length})`;
            details.appendChild(summary);

            matchedBlocks.forEach(blockData => {
                const blockLabel = document.createElement("p");
                blockLabel.className = "tools-box-function";
                blockLabel.textContent = blockData.name;
                blockLabel.draggable = true;

                blockLabel.addEventListener("dragstart", (e) => {
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData("application/json", JSON.stringify({
                        kind: "block",
                        blockData
                    }));
                });

                details.appendChild(blockLabel);
            });

            toolsBoxBody.appendChild(details);
        }
    }

    Object.entries(functions).forEach(([moduleName, arr]) => {
        const details = document.createElement("details");
        details.className = "tools-box-group";

        const summary = document.createElement("summary");
        summary.textContent = `${moduleName} (${arr.length})`;
        details.appendChild(summary);

        arr.forEach(element => {
            const functionLabel = document.createElement("p");
            functionLabel.className = "tools-box-function";
            functionLabel.textContent = element;
            functionLabel.draggable = true;

            functionLabel.addEventListener("dragstart", (e) => {
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData("application/json", JSON.stringify({
                    kind: "function",
                    moduleName: moduleName,
                    functionName: element
                }));
            });

            details.appendChild(functionLabel);
        });

        toolsBoxBody.appendChild(details);
    });
});
