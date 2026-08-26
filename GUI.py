import webview
import importlib
import importlib.util
import inspect
import builtins
from typing import Optional
import requests
from bs4 import BeautifulSoup

# Google翻訳(モバイル版)はUser-Agentが無いリクエストをボットとみなし拒否するため、
# ブラウザを偽装するヘッダーを付与する。
_TRANSLATE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    )
}


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

    def get_function_signature(self, module_name: str, func_name: str) -> dict:
        """
        指定した関数のシグネチャ情報を取得する。
        引数情報を {名前: デフォルト値} の形式で返す。
        """
        if not self.check_module_exists(module_name):
            return {"params": [], "error": f"Module {module_name} not found"}

        try:
            if module_name == "builtins" or (
                hasattr(builtins, func_name)
                and not importlib.util.find_spec(module_name)
            ):
                module = builtins
            else:
                module = importlib.import_module(module_name)
        except Exception as e:
            return {"params": [], "error": str(e)}

        func = getattr(module, func_name, None)
        if not callable(func):
            return {"params": [], "error": f"{func_name} is not callable"}

        try:
            sig = inspect.signature(func)
            params = []
            for param_name, param in sig.parameters.items():
                if param_name in ("self", "cls"):
                    continue
                params.append(
                    {
                        "name": param_name,
                        "default": (
                            str(param.default)
                            if param.default != inspect.Parameter.empty
                            else None
                        ),
                        "kind": str(param.kind),
                    }
                )
            return {"params": params, "error": None}
        except (ValueError, TypeError):
            return {"params": [], "error": "Could not get signature"}

    def get_translated_doc(self, module_name: str, func_name: str) -> dict:
        """
        指定した関数のドキュメント(docstring)を取得し、日本語に翻訳して返す。
        """
        if not self.check_module_exists(module_name):
            return {"doc": None, "error": f"Module {module_name} not found"}

        try:
            if module_name == "builtins" or (
                hasattr(builtins, func_name)
                and not importlib.util.find_spec(module_name)
            ):
                module = builtins
            else:
                module = importlib.import_module(module_name)
        except Exception as e:
            return {"doc": None, "error": str(e)}

        func = getattr(module, func_name, None)
        if not callable(func):
            return {"doc": None, "error": f"{func_name} is not callable"}

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
        Google翻訳(モバイル版エンドポイント)の1回あたりの文字数制限を考慮し、
        テキストを行単位のチャンクに分けてから日本語に翻訳して結合する。
        """
        max_chunk_size = 4500

        lines = text.splitlines()
        chunks = []
        current = ""
        for line in lines:
            candidate = f"{current}\n{line}" if current else line
            if len(candidate) > max_chunk_size and current:
                chunks.append(current)
                current = line
            else:
                current = candidate
        if current:
            chunks.append(current)

        translated_chunks = [self._translate_chunk(chunk) for chunk in chunks]
        return "\n".join(translated_chunks)

    def _translate_chunk(self, text: str) -> str:
        response = requests.get(
            "https://translate.google.com/m",
            params={"sl": "en", "tl": "ja", "q": text},
            headers=_TRANSLATE_HEADERS,
            timeout=10,
        )
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        element = soup.find("div", {"class": "result-container"})
        if element is None:
            raise RuntimeError("Could not parse translation result")

        return element.get_text(strip=True)


if __name__ == "__main__":
    api = Api()
    window = webview.create_window("My First App", url="./web/index.html", js_api=api)
    api.set_window(window)
    webview.start(http_server=True, debug=True)
