import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const descriptions = {
  "Initial MIDGAS website": ["Создана первая версия сайта MIDGAS: главная страница, реестры и базовая система карточек."],
  "Add ChatGPT Sites project binding": ["Добавлена конфигурация первой публикационной площадки проекта."],
  "Prepare optimized ChatGPT Sites deployment": ["Оптимизирована сборка и подготовлены статические материалы сайта."],
  "Serve explicit asset MIME types": ["Исправлена выдача типов файлов для изображений, стилей и сценариев."],
  "Deploy MIDGAS with GitHub Pages": ["Сайт переведён на публикацию через GitHub Pages."],
  "Expand historical archive chronology": ["Расширена хронология Исторического архива и добавлены новые эпохи."],
  "Align archive rail with timeline entries": ["Шкала архива приведена в соответствие с разделами временной линии."],
  "Compact glossary and mobile archive rail": ["Глоссарий и мобильная шкала архива сделаны компактнее."],
  "Reimagine glossary as expandable cards": ["Глоссарий переработан в раскрывающиеся карточки терминов."],
  "Integrate immersive archive imagery": ["В Исторический архив добавлены фоновые и переднеплановые изображения."],
  "Build interactive company hub": ["Создан интерактивный раздел компании с журналом, материалами и редактором."],
  "Expand and animate glossary": ["Добавлены новые термины и анимации глоссария."],
  "Strengthen archive parallax depth": ["Усилен параллакс и глубина визуальных слоёв Исторического архива."],
  "Expand company field archive gallery": ["Расширена фотокартотека полевых материалов компании."],
  "Simplify registry change journal": ["Журнал изменений реестра упрощён и сделан понятнее."],
  "Fix quote carousel transitions": ["Исправлено переключение цитат и автоматическая ротация."],
  "Build pannable investigation map": ["Создана перемещаемая интерактивная доска связей."],
  "Build functional local dossier editor": ["Добавлен первый рабочий прототип редактора досье."],
  "Fix mobile gallery two-column layout": ["Исправлена двухколоночная фотокартотека на телефонах."],
  "Rebuild investigation board interactions": ["Переработаны управление и взаимодействия доски связей."],
  "Eliminate investigation board card overlaps": ["Устранены перекрытия карточек на доске связей."],
  "Split registry journal across five July revisions": ["История наполнения реестра распределена по пяти июльским ревизиям."],
  "Redesign company research workflow": ["Обновлено представление исследовательской работы компании."],
  "Compact investigation board card layout": ["Карточки доски связей размещены компактнее без пересечений."],
  "Fix glossary archive anchor links": ["Исправлены переходы к глоссарию и разделам архива."],
  "Add editor relationship selection": ["В редактор добавлен выбор связей между карточками."],
  "Simplify company workflow section": ["Упрощён информационный раздел о работе редакции."],
  "Stabilize desktop archive photo layout": ["Исправлена раскладка фотографий на больших экранах."],
  "Refine five-day change journal": ["Обновлён внешний вид пятидневного журнала реестра."],
  "Rebuild header navigation and gate editor access": ["Перестроено верхнее меню и добавлен прототип защищённого входа в редактор."],
  "Add reversible record editing and shared relations": ["Добавлено редактирование, скрытие и восстановление карточек без потери номера.", "Связи карточек объединены с доской связей."],
  "Simplify editor mode and restore published versions": ["Упрощён режим редактора и добавлен возврат к опубликованной версии."],
  "Stabilize record editor relations and image uploads": ["Исправлены выбор связей и загрузка изображений в редакторе."],
  "Add bounded pinch zoom to investigation board": ["Добавлен ограниченный жест масштабирования доски на мобильных устройствах."],
  "Add secure Supabase setup blueprint": ["Подготовлена защищённая схема Supabase, ролей редакторов и правил доступа."],
  "Refine editor media, access fields, and company hub": ["Улучшены медиа-поля редактора, уровни доступа и раздел компании."],
  "Connect editor to Supabase": ["Редактор подключён к Supabase: карточки, связи, изображения и версии синхронизируются между устройствами."],
  "Обновление сайта": ["Обновлены разделы сайта, интерфейс редактора и содержимое реестра."],
  "Add secure password change to editor": ["В редактор добавлена безопасная смена пароля с завершением других сессий."],
  "Refresh historical archive imagery": ["Обновлены главный экран, туман и переднеплановые материалы Исторического архива."],
  "Sync relationship board across devices": ["Исправлена синхронизация доски связей между устройствами.", "Удалены тестовые карточки клиентов 27 и 28."],
};

const output = execFileSync("git", ["log", "--reverse", "--date=iso-strict", "--pretty=format:%H%x1f%ad%x1f%s%x1e"], { encoding: "utf8" });
const deployments = output.split("\x1e").map((entry) => entry.trim()).filter(Boolean).map((entry, index) => {
  const [hash, date, subject] = entry.split("\x1f");
  return {
    revision: index + 1,
    hash: hash.slice(0, 8),
    date,
    title: subject,
    changes: descriptions[subject] || [subject],
  };
}).reverse();

writeFileSync(resolve("web/deploy-history.js"), `window.MIDGAS_DEPLOY_HISTORY = ${JSON.stringify(deployments, null, 2)};\n`, "utf8");
