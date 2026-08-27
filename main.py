import ast
import json
import textwrap
import webview
import importlib
import importlib.util
import inspect
import builtins
from pathlib import Path
from typing import Callable, Optional
import argostranslate.package
import argostranslate.translate


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    hex_color = hex_color.lstrip("#")
    return (int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16))


def _load_block_color_rules() -> dict:
    """
    関数呼び出しブロックの色を決めるルールを block_color_rules.json から読み込む。
    カテゴリ(math/string/file_io/network/datetime/data_structureなど)ごとに
    「どのモジュール参照/呼び出しをそのカテゴリの兆候とみなすか」と色を定義する。
    関数の中身(AST)を解析してカテゴリごとにスコアをつけ、
    最もスコアの高いカテゴリの色へ、default_colorから連続的に近づける
    """
    path = Path(__file__).parent / "block_color_rules.json"
    with path.open(encoding="utf-8") as f:
        rules = json.load(f)

    module_to_category: dict[str, str] = {}
    call_to_category: dict[str, str] = {}
    arithmetic_categories: list[str] = []
    category_colors: dict[str, tuple[int, int, int]] = {}

    for category in rules["categories"]:
        name = category["name"]
        category_colors[name] = _hex_to_rgb(category["color"])
        for module_name in category.get("modules", []):
            module_to_category[module_name] = name
        for call_name in category.get("calls", []):
            call_to_category[call_name] = name
        if category.get("arithmetic"):
            arithmetic_categories.append(name)

    return {
        "arithmetic_ops": tuple(getattr(ast, name) for name in rules["arithmetic_ops"]),
        "score_scale": rules["score_scale"],
        "default_color": _hex_to_rgb(rules["default_color"]),
        "module_to_category": module_to_category,
        "call_to_category": call_to_category,
        "arithmetic_categories": arithmetic_categories,
        "category_colors": category_colors,
    }


_BLOCK_COLOR_RULES = _load_block_color_rules()


class Api:

    def __init__(self):
        self._window = None

    def set_window(self, window):
        self._window = window

    def check_module_exists(self, module_name: str) -> bool:
        """
        ライブラリ名として存在するかを確認する。
        print, len 等の組み込み関数名の場合も builtins 経由で判定する。
        """
        # まず組み込み関数/組み込みオブジェクトとして存在するか確認
        if hasattr(builtins, module_name):
            return True

        try:
            return importlib.util.find_spec(module_name) is not None
        except (ValueError, ModuleNotFoundError, ImportError, AttributeError):
            return False

    def check_modules_exist(self, module_names: list[str]) -> dict[str, bool]:
        """
        複数のライブラリ名/関数名をまとめて存在確認する。
        戻り値は {名前: 存在するか} の辞書。
        """
        return {name: self.check_module_exists(name) for name in module_names}

    def list_module_functions(self, module_name: str) -> list[str]:
        """
        指定したライブラリ(または 'builtins')内の関数名一覧を取得する。
        存在しない/importに失敗した場合は空リストを返す。
        """
        if not self.check_module_exists(module_name):
            return []

        try:
            module = (
                builtins
                if hasattr(builtins, module_name)
                and not importlib.util.find_spec(module_name)
                else importlib.import_module(module_name)
            )
        except Exception:
            module = builtins if hasattr(builtins, module_name) else None

        if module is None:
            return []

        return sorted(
            [
                name
                for name, obj in inspect.getmembers(module)
                if inspect.isfunction(obj) or inspect.isbuiltin(obj)
            ]
        )

    def find_function(self, module_names: list[str], func_name: str) -> Optional[str]:
        """
        複数のライブラリ名(+ 'builtins' 相当の組み込み関数)の中から
        func_name を探し、最初に見つかったモジュール名を返す。
        見つからなければ None。
        """
        # 組み込み関数として直接該当するか確認 (print, len など)
        if hasattr(builtins, func_name) and callable(getattr(builtins, func_name)):
            return "builtins"

        for module_name in module_names:
            if not self.check_module_exists(module_name):
                continue
            try:
                module = importlib.import_module(module_name)
            except Exception:
                continue

            func = getattr(module, func_name, None)
            if callable(func):
                return module_name

        return None

    def search_functions(
        self,
        module_names: list[str],
        query: str,
        case_sensitive: bool = False,
    ) -> dict[str, list[str]]:
        """
        複数のライブラリ(+ 'builtins')から、関数名に query を含む関数を検索する。

        Args:
            module_names: 検索対象のモジュール名リスト('builtins' も指定可能)
            query: 検索キーワード(部分一致)
            case_sensitive: 大文字・小文字を区別するかどうか(デフォルト: 区別しない)

        Returns:
            {モジュール名: [一致した関数名, ...]} の辞書。
            一致する関数が1つも無いモジュールはキーごと省略される。
        """
        if not query:
            return {}

        target_query = query if case_sensitive else query.lower()
        results: dict[str, list[str]] = {}

        for module_name in module_names:
            functions = self.list_module_functions(module_name)
            if not functions:
                continue

            matched = [
                name
                for name in functions
                if (name if case_sensitive else name.lower()).find(target_query) != -1
            ]

            if matched:
                results[module_name] = matched

        return results

    def search_functions_flat(
        self,
        module_names: list[str],
        query: str,
        case_sensitive: bool = False,
    ) -> list[dict[str, str]]:
        """
        search_functions と同じ検索を行うが、結果を
        [{"module": モジュール名, "function": 関数名}, ...] のフラットな形式で返す。
        フロントエンド(JS)側でテーブル表示する際などに扱いやすい形式。
        """
        grouped = self.search_functions(module_names, query, case_sensitive)
        return [
            {"module": module_name, "function": func_name}
            for module_name, func_names in grouped.items()
            for func_name in func_names
        ]

    def _resolve_function(
        self, module_name: str, func_name: str
    ) -> tuple[Optional[Callable], Optional[str]]:
        """
        module_name/func_name から呼び出し可能オブジェクトを解決する。
        (関数, エラー文言) のタプルを返す。解決できなければ関数側はNone。
        """
        if not self.check_module_exists(module_name):
            return None, f"Module {module_name} not found"

        try:
            if module_name == "builtins" or (
                hasattr(builtins, func_name)
                and not importlib.util.find_spec(module_name)
            ):
                module = builtins
            else:
                module = importlib.import_module(module_name)
        except Exception as e:
            return None, str(e)

        func = getattr(module, func_name, None)
        if not callable(func):
            return None, f"{func_name} is not callable"

        return func, None

    def get_function_block(self, module_name: str, func_name: str) -> dict:
        """
        指定した関数を、web/block/blocks.js と同じスキーマのブロックJSONに変換する。
        ブロックの見た目(ラベル/入力欄の並び)はここで組み立て、
        フロントエンドはそれをそのままcreateBlockに渡すだけにする。
        """
        func, error = self._resolve_function(module_name, func_name)
        if error or func is None:
            return {"block": None, "error": error}

        try:
            sig = inspect.signature(func)
            param_names = [
                name for name in sig.parameters if name not in ("self", "cls")
            ]
        except (ValueError, TypeError):
            param_names = []

        return {
            "block": self._build_call_block(module_name, func_name, param_names, func=func),
            "error": None,
        }

    def _category_scores(self, module_name: str, func: Optional[Callable]) -> dict[str, float]:
        """
        関数の中身が各カテゴリ(math/string/file_io/network/datetime/data_structureなど、
        block_color_rules.json参照)にどれだけ当てはまるかを0〜100のスコアで返す。
        関数のAST中で、そのカテゴリのモジュールへの参照/関数呼び出しが
        全体に占める割合をスコアにする。
        C実装でソースが読めない組み込み関数(math.sqrt等)は、
        代わりに所属モジュール名からカテゴリを1つ直接あてる
        """
        rules = _BLOCK_COLOR_RULES

        try:
            source = inspect.getsource(func) if func is not None else None
        except (OSError, TypeError):
            source = None

        if source is None:
            category = rules["module_to_category"].get(module_name)
            return {category: 100.0} if category else {}

        try:
            tree = ast.parse(textwrap.dedent(source))
        except SyntaxError:
            return {}

        hits: dict[str, int] = {}
        total_nodes = 0
        for node in ast.walk(tree):
            total_nodes += 1
            if isinstance(node, ast.BinOp) and isinstance(node.op, rules["arithmetic_ops"]):
                for category in rules["arithmetic_categories"]:
                    hits[category] = hits.get(category, 0) + 1
            elif isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
                category = rules["module_to_category"].get(node.value.id)
                if category:
                    hits[category] = hits.get(category, 0) + 1
            elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                category = rules["call_to_category"].get(node.func.id)
                if category:
                    hits[category] = hits.get(category, 0) + 1

        if total_nodes == 0:
            return {}

        return {
            category: min(100.0, (count / total_nodes) * rules["score_scale"])
            for category, count in hits.items()
        }

    def _pick_block_color(self, scores: dict[str, float]) -> str:
        """
        カテゴリごとのスコアのうち最も高いものを採用し、default_colorから
        そのカテゴリの色へ、スコアに応じて連続的に近づけた色を返す
        """
        rules = _BLOCK_COLOR_RULES
        default_color = rules["default_color"]

        if not scores:
            return "#{:02x}{:02x}{:02x}".format(*default_color)

        category, score = max(scores.items(), key=lambda item: item[1])
        if score <= 0:
            return "#{:02x}{:02x}{:02x}".format(*default_color)

        category_color = rules["category_colors"][category]
        t = max(0.0, min(1.0, score / 100))
        rgb = (
            round(default_color[i] + (category_color[i] - default_color[i]) * t)
            for i in range(3)
        )
        return "#{:02x}{:02x}{:02x}".format(*rgb)

    def _build_call_block(
        self,
        module_name: str,
        func_name: str,
        param_names: list[str],
        arg_sources: Optional[list[str]] = None,
        func: Optional[Callable] = None,
    ) -> dict:
        """
        関数呼び出しブロックのJSONを組み立てる。
        arg_sources を渡すと、対応する引数欄に初期値として埋め込む
        (.pyファイル読み込み時に、実際に渡されていた引数の式をそのまま復元するため)
        """
        arg_sources = arg_sources or []
        label = (
            f"{func_name}("
            if module_name == "builtins"
            else f"{module_name}.{func_name}("
        )

        block_slide = [{"type": "label", "text": label}]
        for index in range(max(len(param_names), len(arg_sources))):
            if index > 0:
                block_slide.append({"type": "label", "text": ","})
            item = {"type": "input", "input_type": "text"}
            if index < len(param_names):
                item["placeholder"] = param_names[index]
            if index < len(arg_sources):
                item["value"] = arg_sources[index]
            block_slide.append(item)
        block_slide.append({"type": "label", "text": ")"})

        return {
            "type": "block",
            "block_module": module_name,
            "block_label": func_name,
            "block_tag": "function_call",
            "block_color": self._pick_block_color(self._category_scores(module_name, func)),
            "block_slide": block_slide,
            "block_back": [],
        }

    def _build_import_block(self, module_name: str) -> dict:
        return {
            "type": "block",
            "name": "import",
            "block_module": "builtins",
            "block_label": "__import__",
            "block_tag": "import",
            "block_color": "#25d45a",
            "block_slide": [
                {"type": "label", "text": "import"},
                {
                    "type": "checked",
                    "check": "import_module",
                    "when": "blur",
                    "warp": {
                        "type": "input",
                        "input_type": "text",
                        "system": "import_module",
                        "value": module_name,
                    },
                    "on_success": [],
                    "on_fail": [{"type": "label", "text": "⚠️"}],
                },
            ],
            "block_back": [],
        }

    def _build_assign_block(self, target_name: str, value_source: str) -> dict:
        return {
            "type": "block",
            "name": "assign",
            "block_module": "",
            "block_label": "",
            "block_tag": "=",
            "block_color": "#caaa40",
            "block_slide": [
                {
                    "type": "input",
                    "input_type": "text",
                    "placeholder": "variable name",
                    "value": target_name,
                },
                {"type": "label", "text": "="},
                {"type": "input", "input_type": "text", "value": value_source},
                {"type": "input", "input_type": "block", "system": "add-block"},
                {"type": "input", "input_type": "text"},
            ],
            "block_back": [],
        }

    def _resolve_call_name(self, func_node) -> Optional[tuple[str, str]]:
        """
        Call式のfunc部分から (module_name, func_name) を判定する。
        `print(...)` のような単純名は builtins、`os.listdir(...)` のような
        `モジュール.関数` の形だけをサポートする。それ以外(メソッドチェーン等)はNone。
        """
        if isinstance(func_node, ast.Name):
            return "builtins", func_node.id
        if isinstance(func_node, ast.Attribute) and isinstance(func_node.value, ast.Name):
            return func_node.value.id, func_node.attr
        return None

    def _call_to_block(self, call_node: ast.Call) -> Optional[dict]:
        resolved = self._resolve_call_name(call_node.func)
        if resolved is None:
            return None
        module_name, func_name = resolved

        func, error = self._resolve_function(module_name, func_name)
        param_names: list[str] = []
        if not error and func is not None:
            try:
                sig = inspect.signature(func)
                param_names = [
                    name for name in sig.parameters if name not in ("self", "cls")
                ]
            except (ValueError, TypeError):
                param_names = []

        try:
            arg_sources = [ast.unparse(arg) for arg in call_node.args]
        except Exception:
            return None

        return self._build_call_block(module_name, func_name, param_names, arg_sources, func=func)

    def _statement_to_blocks(self, node: ast.stmt) -> list[dict]:
        """
        トップレベルの文を、対応可能な範囲でブロックJSONのリストに変換する。
        対応: import文、単純な変数への代入文、関数呼び出し文のみ。
        それ以外(if/for/def/class 等)は空リストを返す(=読み込み時にスキップされる)。
        """
        if isinstance(node, ast.Import):
            return [self._build_import_block(alias.name) for alias in node.names]

        if (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
        ):
            try:
                value_source = ast.unparse(node.value)
            except Exception:
                return []
            return [self._build_assign_block(node.targets[0].id, value_source)]

        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            block = self._call_to_block(node.value)
            return [block] if block else []

        return []

    def load_python_file(self, path: str) -> dict:
        """
        .pyファイルを読み込み、対応可能な範囲でブロックJSONのリストに変換する。
        変換できなかった文の数を skipped で返す。
        """
        try:
            with open(path, "r", encoding="utf-8") as f:
                source = f.read()
        except OSError as e:
            return {"blocks": [], "skipped": 0, "error": str(e)}

        try:
            tree = ast.parse(source)
        except SyntaxError as e:
            return {"blocks": [], "skipped": 0, "error": f"Syntax error: {e}"}

        blocks: list[dict] = []
        skipped = 0
        for node in tree.body:
            node_blocks = self._statement_to_blocks(node)
            if node_blocks:
                blocks.extend(node_blocks)
            else:
                skipped += 1

        return {"blocks": blocks, "skipped": skipped, "error": None}

    def load_python_file_dialog(self) -> dict:
        """
        ネイティブのファイル選択ダイアログで.pyファイルを選ばせ、
        読み込んでブロックJSONのリストに変換する。
        """
        if self._window is None:
            return {"blocks": [], "skipped": 0, "error": "Window not ready"}

        paths = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            file_types=("Python files (*.py)", "All files (*.*)"),
        )
        if not paths:
            return {"blocks": [], "skipped": 0, "error": None}

        return self.load_python_file(paths[0])

    def save_python_file_dialog(self, code: str) -> dict:
        """
        ネイティブの保存ダイアログでパスを選ばせ、渡されたPythonコードを書き出す。
        """
        if self._window is None:
            return {"error": "Window not ready"}

        paths = self._window.create_file_dialog(
            webview.FileDialog.SAVE,
            save_filename="untitled.py",
            file_types=("Python files (*.py)", "All files (*.*)"),
        )
        if not paths:
            return {"error": None}

        try:
            with open(paths[0], "w", encoding="utf-8") as f:
                f.write(code)
        except OSError as e:
            return {"error": str(e)}

        return {"error": None}

    def get_translated_doc(self, module_name: str, func_name: str) -> dict:
        """
        指定した関数のドキュメント(docstring)を取得し、日本語に翻訳して返す。
        """
        func, error = self._resolve_function(module_name, func_name)
        if error or func is None:
            return {"doc": None, "error": error}

        doc = inspect.getdoc(func)
        if not doc:
            return {"doc": None, "error": "No documentation available"}

        try:
            translated = self._translate_to_japanese(doc)
        except Exception as e:
            return {"doc": doc, "error": f"Translation failed: {e}"}

        return {"doc": translated, "error": None}

    def _translate_to_japanese(self, text: str) -> str:
        """
        argostranslate(ローカルのニューラル機械翻訳)を使い、外部サービスに
        依存せず日本語に翻訳する。行単位で翻訳して結合する。
        """
        translation = argostranslate.translate.get_translation_from_codes("en", "ja")
        lines = text.splitlines()
        translated_lines = [translation.translate(line) if line else "" for line in lines]
        return "\n".join(translated_lines)


if __name__ == "__main__":
    api = Api()
    window = webview.create_window("My First App", url="./web/index.html", js_api=api)
    api.set_window(window)
    webview.start(http_server=True, debug=True)
