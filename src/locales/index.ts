// The app's translations, bundled: locales/<language>/<namespace>.json.
// Add a language's folder here as well as to LANGUAGES in lib/i18n.ts.

import de_common from "./de/common.json";
import de_data from "./de/data.json";
import de_dialogs from "./de/dialogs.json";
import de_editor from "./de/editor.json";
import de_layout from "./de/layout.json";
import de_native from "./de/native.json";
import de_schema from "./de/schema.json";
import en_common from "./en/common.json";
import en_data from "./en/data.json";
import en_dialogs from "./en/dialogs.json";
import en_editor from "./en/editor.json";
import en_layout from "./en/layout.json";
import en_native from "./en/native.json";
import en_schema from "./en/schema.json";
import es_common from "./es/common.json";
import es_data from "./es/data.json";
import es_dialogs from "./es/dialogs.json";
import es_editor from "./es/editor.json";
import es_layout from "./es/layout.json";
import es_native from "./es/native.json";
import es_schema from "./es/schema.json";
import fr_common from "./fr/common.json";
import fr_data from "./fr/data.json";
import fr_dialogs from "./fr/dialogs.json";
import fr_editor from "./fr/editor.json";
import fr_layout from "./fr/layout.json";
import fr_native from "./fr/native.json";
import fr_schema from "./fr/schema.json";
import id_common from "./id/common.json";
import id_data from "./id/data.json";
import id_dialogs from "./id/dialogs.json";
import id_editor from "./id/editor.json";
import id_layout from "./id/layout.json";
import id_native from "./id/native.json";
import id_schema from "./id/schema.json";
import it_common from "./it/common.json";
import it_data from "./it/data.json";
import it_dialogs from "./it/dialogs.json";
import it_editor from "./it/editor.json";
import it_layout from "./it/layout.json";
import it_native from "./it/native.json";
import it_schema from "./it/schema.json";
import ja_common from "./ja/common.json";
import ja_data from "./ja/data.json";
import ja_dialogs from "./ja/dialogs.json";
import ja_editor from "./ja/editor.json";
import ja_layout from "./ja/layout.json";
import ja_native from "./ja/native.json";
import ja_schema from "./ja/schema.json";
import ko_common from "./ko/common.json";
import ko_data from "./ko/data.json";
import ko_dialogs from "./ko/dialogs.json";
import ko_editor from "./ko/editor.json";
import ko_layout from "./ko/layout.json";
import ko_native from "./ko/native.json";
import ko_schema from "./ko/schema.json";
import nl_common from "./nl/common.json";
import nl_data from "./nl/data.json";
import nl_dialogs from "./nl/dialogs.json";
import nl_editor from "./nl/editor.json";
import nl_layout from "./nl/layout.json";
import nl_native from "./nl/native.json";
import nl_schema from "./nl/schema.json";
import pl_common from "./pl/common.json";
import pl_data from "./pl/data.json";
import pl_dialogs from "./pl/dialogs.json";
import pl_editor from "./pl/editor.json";
import pl_layout from "./pl/layout.json";
import pl_native from "./pl/native.json";
import pl_schema from "./pl/schema.json";
import pt_BR_common from "./pt-BR/common.json";
import pt_BR_data from "./pt-BR/data.json";
import pt_BR_dialogs from "./pt-BR/dialogs.json";
import pt_BR_editor from "./pt-BR/editor.json";
import pt_BR_layout from "./pt-BR/layout.json";
import pt_BR_native from "./pt-BR/native.json";
import pt_BR_schema from "./pt-BR/schema.json";
import ru_common from "./ru/common.json";
import ru_data from "./ru/data.json";
import ru_dialogs from "./ru/dialogs.json";
import ru_editor from "./ru/editor.json";
import ru_layout from "./ru/layout.json";
import ru_native from "./ru/native.json";
import ru_schema from "./ru/schema.json";
import tr_common from "./tr/common.json";
import tr_data from "./tr/data.json";
import tr_dialogs from "./tr/dialogs.json";
import tr_editor from "./tr/editor.json";
import tr_layout from "./tr/layout.json";
import tr_native from "./tr/native.json";
import tr_schema from "./tr/schema.json";
import uk_common from "./uk/common.json";
import uk_data from "./uk/data.json";
import uk_dialogs from "./uk/dialogs.json";
import uk_editor from "./uk/editor.json";
import uk_layout from "./uk/layout.json";
import uk_native from "./uk/native.json";
import uk_schema from "./uk/schema.json";
import zh_CN_common from "./zh-CN/common.json";
import zh_CN_data from "./zh-CN/data.json";
import zh_CN_dialogs from "./zh-CN/dialogs.json";
import zh_CN_editor from "./zh-CN/editor.json";
import zh_CN_layout from "./zh-CN/layout.json";
import zh_CN_native from "./zh-CN/native.json";
import zh_CN_schema from "./zh-CN/schema.json";
import zh_TW_common from "./zh-TW/common.json";
import zh_TW_data from "./zh-TW/data.json";
import zh_TW_dialogs from "./zh-TW/dialogs.json";
import zh_TW_editor from "./zh-TW/editor.json";
import zh_TW_layout from "./zh-TW/layout.json";
import zh_TW_native from "./zh-TW/native.json";
import zh_TW_schema from "./zh-TW/schema.json";

export const resources: Record<string, Record<string, Record<string, unknown>>> = {
  "de": { common: de_common, data: de_data, dialogs: de_dialogs, editor: de_editor, layout: de_layout, native: de_native, schema: de_schema },
  "en": { common: en_common, data: en_data, dialogs: en_dialogs, editor: en_editor, layout: en_layout, native: en_native, schema: en_schema },
  "es": { common: es_common, data: es_data, dialogs: es_dialogs, editor: es_editor, layout: es_layout, native: es_native, schema: es_schema },
  "fr": { common: fr_common, data: fr_data, dialogs: fr_dialogs, editor: fr_editor, layout: fr_layout, native: fr_native, schema: fr_schema },
  "id": { common: id_common, data: id_data, dialogs: id_dialogs, editor: id_editor, layout: id_layout, native: id_native, schema: id_schema },
  "it": { common: it_common, data: it_data, dialogs: it_dialogs, editor: it_editor, layout: it_layout, native: it_native, schema: it_schema },
  "ja": { common: ja_common, data: ja_data, dialogs: ja_dialogs, editor: ja_editor, layout: ja_layout, native: ja_native, schema: ja_schema },
  "ko": { common: ko_common, data: ko_data, dialogs: ko_dialogs, editor: ko_editor, layout: ko_layout, native: ko_native, schema: ko_schema },
  "nl": { common: nl_common, data: nl_data, dialogs: nl_dialogs, editor: nl_editor, layout: nl_layout, native: nl_native, schema: nl_schema },
  "pl": { common: pl_common, data: pl_data, dialogs: pl_dialogs, editor: pl_editor, layout: pl_layout, native: pl_native, schema: pl_schema },
  "pt-BR": { common: pt_BR_common, data: pt_BR_data, dialogs: pt_BR_dialogs, editor: pt_BR_editor, layout: pt_BR_layout, native: pt_BR_native, schema: pt_BR_schema },
  "ru": { common: ru_common, data: ru_data, dialogs: ru_dialogs, editor: ru_editor, layout: ru_layout, native: ru_native, schema: ru_schema },
  "tr": { common: tr_common, data: tr_data, dialogs: tr_dialogs, editor: tr_editor, layout: tr_layout, native: tr_native, schema: tr_schema },
  "uk": { common: uk_common, data: uk_data, dialogs: uk_dialogs, editor: uk_editor, layout: uk_layout, native: uk_native, schema: uk_schema },
  "zh-CN": { common: zh_CN_common, data: zh_CN_data, dialogs: zh_CN_dialogs, editor: zh_CN_editor, layout: zh_CN_layout, native: zh_CN_native, schema: zh_CN_schema },
  "zh-TW": { common: zh_TW_common, data: zh_TW_data, dialogs: zh_TW_dialogs, editor: zh_TW_editor, layout: zh_TW_layout, native: zh_TW_native, schema: zh_TW_schema },
};
