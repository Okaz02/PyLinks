import webview
import importlib
import importlib.util
import inspect
import builtins
from typing import Callable, Optional
import argostranslate.package
import argostranslate.translate


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

        label = (
            f"{func_name}("
            if module_name == "builtins"
            else f"{module_name}.{func_name}("
        )

        block_slide = [{"type": "label", "text": label}]
        for index, param_name in enumerate(param_names):
            if index > 0:
                block_slide.append({"type": "label", "text": ","})
            block_slide.append(
                {"type": "input", "input_type": "text", "placeholder": param_name}
            )
        block_slide.append({"type": "label", "text": ")"})

        block = {
            "type": "block",
            "block_module": module_name,
            "block_label": func_name,
            "block_tag": "function_call",
            "block_color": "#3498db",
            "block_slide": block_slide,
            "block_back": [],
        }
        return {"block": block, "error": None}

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
