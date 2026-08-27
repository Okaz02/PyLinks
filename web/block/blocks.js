export const blocksData = {
    "blocks": [
        {
            "type": "block",
            "name": "import",
            "block_module": "builtins",
            "block_label": "__import__",
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
        },
        {
            "type": "block",
            "name": "=",
            "block_module": "",
            "block_label": "=",
            "block_color": "#caaa40",
            "block_slide": [
                {
                    "type": "input",
                    "input_type": "text",
                    "placeholder": "variable name"
                },
                {
                    "type": "label",
                    "text": "="
                },
                {
                    "type": "input",
                    "input_type": "text"
                }
            ],
            "block_back": []
        },
        {
            "type": "control",
            "name": "for",
            "block_module": "",
            "block_label": "for",
            "block_color": "#eeeb3c",
            "block_slide": [
                {
                    "type": "label",
                    "text": "for"
                },
                {
                    "type": "input",
                    "input_type": "text",
                    "placeholder": "variable name"
                },
                {
                    "type": "label",
                    "text": "in"
                },
                {
                    "type": "input",
                    "input_type": "text",
                    "placeholder": "list"
                },
                {
                    "type": "label",
                    "text": ":"
                }
            ],
            "block_back": []
        }
    ]
}