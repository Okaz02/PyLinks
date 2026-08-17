export const blocksData = {
    "blocks": [
        {
            "type": "block",
            "block_label": "import",
            "block_tag": "import",
            "block_color": "#25d45a",
            "block_slide": [
                {
                    "type": "label",
                    "text": "import"
                },
                {
                    "type": "checked",
                    "check": "import_module",
                    "when": "blur",
                    "warp": { "type": "input", "input_type": "text", "system": "import_module" },
                    "on_success": [],
                    "on_fail": [
                        { "type": "label", "text": "⚠️" }
                    ]

                }
            ],
            "block_back": [
                {
                    "type": "button",
                    "action": "add",
                    "target": [
                        {
                            "type": "button",
                            "action": "delete",
                            "target": [
                                { "type": "label", "text": "," },
                                {
                                    "type": "checked",
                                    "check": "import_module",
                                    "when": "blur",
                                    "warp": { "type": "input", "input_type": "text", "system": "import_module" },
                                    "on_success": [],
                                    "on_fail": [
                                        { "type": "label", "text": "⚠️", "system": "import_module" }
                                    ]

                                }

                            ]
                        }
                    ]
                }
            ]
        }
    ]
}