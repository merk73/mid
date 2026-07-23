import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const titleTranslations = {
  "Initial MIDGAS website": "Первая версия сайта MIDGAS",
  "Add ChatGPT Sites project binding": "Подключение проекта к ChatGPT Sites",
  "Prepare optimized ChatGPT Sites deployment": "Подготовка оптимизированной публикации сайта",
  "Serve explicit asset MIME types": "Корректная выдача типов файлов",
  "Deploy MIDGAS with GitHub Pages": "Публикация MIDGAS через GitHub Pages",
  "Expand historical archive chronology": "Расширение хронологии Исторического архива",
  "Align archive rail with timeline entries": "Синхронизация шкалы архива с временной линией",
  "Compact glossary and mobile archive rail": "Компактный глоссарий и мобильная шкала архива",
  "Reimagine glossary as expandable cards": "Новый формат карточек глоссария",
  "Integrate immersive archive imagery": "Атмосферные изображения Исторического архива",
  "Build interactive company hub": "Интерактивный раздел компании",
  "Expand and animate glossary": "Расширение и анимация глоссария",
  "Strengthen archive parallax depth": "Усиление глубины и параллакса архива",
  "Expand company field archive gallery": "Расширение галереи полевых материалов",
  "Simplify registry change journal": "Упрощение журнала изменений реестра",
  "Fix quote carousel transitions": "Исправление переключения цитат",
  "Build pannable investigation map": "Интерактивная доска связей",
  "Build functional local dossier editor": "Рабочий редактор досье",
  "Fix mobile gallery two-column layout": "Исправление мобильной фотогалереи",
  "Rebuild investigation board interactions": "Переработка управления доской связей",
  "Eliminate investigation board card overlaps": "Устранение пересечений карточек на доске",
  "Split registry journal across five July revisions": "Распределение истории реестра по ревизиям",
  "Redesign company research workflow": "Обновление раздела исследовательской работы",
  "Compact investigation board card layout": "Компактная раскладка доски связей",
  "Fix glossary archive anchor links": "Исправление переходов по глоссарию и архиву",
  "Add editor relationship selection": "Выбор связей в редакторе",
  "Simplify company workflow section": "Упрощение раздела работы редакции",
  "Stabilize desktop archive photo layout": "Исправление фотографий архива на больших экранах",
  "Refine five-day change journal": "Обновление пятидневного журнала изменений",
  "Rebuild header navigation and gate editor access": "Новое меню и защищённый вход в редактор",
  "Add reversible record editing and shared relations": "Обратимое редактирование карточек и общие связи",
  "Simplify editor mode and restore published versions": "Упрощение редактора и восстановление версий",
  "Stabilize record editor relations and image uploads": "Исправление связей и загрузки изображений",
  "Add bounded pinch zoom to investigation board": "Управляемое масштабирование доски жестами",
  "Add secure Supabase setup blueprint": "Защищённая схема Supabase",
  "Refine editor media, access fields, and company hub": "Улучшение медиа, уровней доступа и раздела компании",
  "Connect editor to Supabase": "Подключение редактора к Supabase",
  "Add secure password change to editor": "Безопасная смена пароля в редакторе",
  "Refresh historical archive imagery": "Обновление изображений Исторического архива",
  "Sync relationship board across devices": "Синхронизация доски связей между устройствами",
  "Complete shared editor operations and deployment ledger": "Общие операции редактора и журнал публикаций",
  "Center record narrative columns": "Выравнивание текстовых колонок досье",
  "Narrow record narrative columns": "Настройка ширины текстовых колонок досье",
  "Refine record column and media ratio": "Улучшение колонок и пропорций медиа в досье",
  "Add realtime board editing and record media layout": "Редактирование доски в реальном времени и новая раскладка медиа",
  "Refine mobile board inspector and direct navigation": "Улучшение мобильной доски и прямых переходов",
  "Add protected site entry and board cover": "Защищённый вход на сайт и обложка доски",
  "Refine relationship board cover contrast": "Повышение контраста обложки доски связей",
  "Expand record creation and board editor tools": "Расширение создания карточек и инструментов доски",
  "Preserve quality of uploaded dossier images": "Сохранение качества загруженных фотографий досье",
  "Prevent stale dossier image flash": "Устранение появления устаревших фотографий досье",
  "Add layered client portrait cards": "Многослойные портретные карточки клиентов",
  "Move site access verification to Supabase": "Перенос проверки доступа к сайту в Supabase",
  "Split interactive tools into focused pages": "Разделение интерактивных инструментов по страницам",
  "Restore full-size client card portraits": "Восстановление полноразмерных портретов клиентов",
  "Restore homepage sections and reliable media lifecycle": "Восстановление разделов главной и надёжная работа медиа",
  "Keep homepage navigation transparent over hero": "Прозрачное меню над первым экраном главной",
  "Synchronize board records and client photos": "Синхронизация карточек и фотографий на доске",
  "Improve relationship board controls and threads": "Улучшение управления и нитей доски связей",
  "Restore board styling and simplify editor entry": "Восстановление стиля доски и упрощение входа в редактор",
  "Restore directional move icon on board": "Восстановление понятной кнопки перемещения",
  "Move change journal into editor workspace": "Перенос журнала изменений в редактор",
  "Remove superseded record media from Supabase storage": "Удаление заменённых фотографий из Supabase",
  "Align editor header with standard navigation": "Исправление шапки страницы редактора",
  "Redesign record pages with inline editing and maps": "Новые страницы досье со встроенным редактором и картами",
  "Rebuild editor center with staged creation and rollbacks": "Новый центр редактора с пошаговым созданием и откатами",
  "Fix dossier geography and inline clearance controls": "Исправление географии и показателей доступа в досье",
  "Fix mobile editor portal overflow": "Исправление блока редактора на мобильных устройствах",
  "Restore anomaly and incident dossier covers": "Восстановление обложек аномалий и инцидентов",
  "Match editor back button to dark header": "Исправление кнопки назад в тёмной шапке редактора",
  "Redesign editor center and restore record save controls": "Переработка центра редактора и возврат сохранения досье",
  "Align editor center with MIDGAS visual style": "Оформление центра редактора в стиле MIDGAS",
  "Sync board links and stabilize homepage previews": "Синхронизация связей и исправление блоков главной",
  "Add Supabase-backed world locations map": "Карта локаций с синхронизацией через Supabase",
  "Add role-based editor access and focused card wizard": "Уровни доступа редактора и пошаговое создание карточек",
  "Fix map loading after secure access": "Исправление загрузки карты после защищённого входа",
  "Audit Supabase and responsive site layout": "Проверка Supabase и адаптивной вёрстки сайта",
  "Refine mobile board portal and map UI": "Улучшение мобильного блока связей и карт",
};

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
  "Complete shared editor operations and deployment ledger": ["Завершены общие операции редактора и добавлен публичный журнал публикаций сайта."],
  "Center record narrative columns": ["Текстовые колонки досье выровнены по центру для более аккуратного чтения."],
  "Narrow record narrative columns": ["Ширина текстовых колонок досье уменьшена для лучшей читаемости."],
  "Refine record column and media ratio": ["Уточнены ширина колонок и пропорции изображений на страницах досье."],
  "Add realtime board editing and record media layout": ["Добавлено редактирование доски в реальном времени и обновлена раскладка фотографий в досье."],
  "Refine mobile board inspector and direct navigation": ["Улучшена мобильная панель доски и добавлены прямые переходы к карточкам."],
  "Add protected site entry and board cover": ["Добавлены защищённый вход на сайт и отдельная обложка перехода к доске связей."],
  "Refine relationship board cover contrast": ["Повышена читаемость текста и элементов на обложке доски связей."],
  "Expand record creation and board editor tools": ["Расширены форма создания карточек и инструменты редактирования доски."],
  "Preserve quality of uploaded dossier images": ["Загружаемые фотографии досье теперь сохраняются без лишней потери качества."],
  "Prevent stale dossier image flash": ["Устранено краткое появление старой фотографии при открытии обновлённого досье."],
  "Add layered client portrait cards": ["Добавлено многослойное оформление портретов в карточках клиентов."],
  "Move site access verification to Supabase": ["Проверка доступа к сайту перенесена в защищённую функцию Supabase."],
  "Split interactive tools into focused pages": ["Редактор и доска связей вынесены на отдельные страницы без удаления блоков главной."],
  "Restore full-size client card portraits": ["Возвращены полноразмерные фотографии клиентов без обрезки и двойного фона."],
  "Restore homepage sections and reliable media lifecycle": ["Восстановлены разделы главной страницы и исправлено удаление заменённых фотографий."],
  "Keep homepage navigation transparent over hero": ["Верхнее меню остаётся прозрачным, пока открыт первый экран главной страницы."],
  "Synchronize board records and client photos": ["Доска связей синхронизирована с карточками и актуальными фотографиями клиентов."],
  "Improve relationship board controls and threads": ["Улучшены элементы управления доской, а активные нити сделаны контрастнее."],
  "Restore board styling and simplify editor entry": ["Возвращён прежний стиль доски, а блок входа в редактор на главной упрощён."],
  "Restore directional move icon on board": ["Кнопке перемещения на доске возвращена понятная направленная иконка."],
  "Move change journal into editor workspace": ["Журнал изменений перенесён в интерфейс центра редактора."],
  "Remove superseded record media from Supabase storage": ["Заменённые и удалённые фотографии больше не остаются в хранилище Supabase."],
  "Align editor header with standard navigation": ["Шапка редактора приведена к общей навигации сайта."],
  "Redesign record pages with inline editing and maps": ["Страницы клиентов, аномалий и инцидентов упрощены; редактирование и карты встроены прямо в досье."],
  "Rebuild editor center with staged creation and rollbacks": ["Центр редактора получил пошаговое создание карточек, журнал и возможность отката изменений."],
  "Fix dossier geography and inline clearance controls": ["Исправлена география досье, а уровни угрозы и доступа перенесены в интерактивные показатели."],
  "Fix mobile editor portal overflow": ["Блок перехода в редактор больше не выходит за границы мобильного экрана."],
  "Restore anomaly and incident dossier covers": ["Возвращены фоновые изображения на страницах аномалий и инцидентов."],
  "Match editor back button to dark header": ["Кнопка назад приведена к тёмному оформлению шапки редактора."],
  "Redesign editor center and restore record save controls": ["Центр редактора упрощён, а в досье инцидентов и аномалий возвращена кнопка сохранения."],
  "Align editor center with MIDGAS visual style": ["Структура центра редактора сохранена и приведена к фирменному стилю MIDGAS."],
  "Sync board links and stabilize homepage previews": ["Связи доски синхронизированы с базой, а мобильные блоки главной стабилизированы."],
  "Add Supabase-backed world locations map": ["Добавлена общая карта локаций клиентов и аномалий с синхронизацией через Supabase."],
  "Add role-based editor access and focused card wizard": ["Добавлены три уровня доступа редактора и упрощённое пошаговое создание карточек."],
  "Fix map loading after secure access": ["Карта корректно загружается после прохождения защищённого входа на сайт."],
  "Audit Supabase and responsive site layout": ["Проверены подключения Supabase, адаптивная вёрстка, тексты и основные разделы сайта."],
  "Refine mobile board portal and map UI": ["Переработан мобильный блок перехода к связям и очищен интерфейс карт от лишнего брендинга."],
  "Перевести журнал обновлений на русский": ["Журнал обновлений полностью переведён на русский язык."],
  "Перенести уровни клиентов в строку карточки": ["Уровни угрозы и доступа перенесены в отдельную строку карточки клиента."],
  "Растянуть показатели на ширину карточки": ["Показатели угрозы и доступа растянуты на всю доступную ширину карточки."],
  "Прокачать редактор доски и закрепить новые фото": ["Редактор доски связей стал удобнее, а карточки используют актуальные фотографии."],
  "Исправить загрузку карточек на доске": ["Исправлена одновременная загрузка всех карточек на доске связей."],
  "Убран фильтр материалов на странице Клиентов": ["Убран неактуальный фильтр материалов в каталоге клиентов."],
  "Улучшить мобильный интерфейс, карту и навигацию": ["Улучшены мобильный интерфейс, карта локаций и навигация сайта."],
  "Вернуть архив и улучшить мобильные каталоги": ["Восстановлен Исторический архив и улучшены мобильные каталоги."],
  "Сделать карточки главной двухколоночными на мобильных": ["Карточки на главной странице выстроены в две читаемые колонки на мобильных устройствах."],
  "Упростить доску и мобильные карточки": ["Упрощены доска связей и отображение карточек на мобильных устройствах."],
  "Убрать мобильные разделители в шапке": ["Убраны лишние вертикальные разделители в мобильной шапке."],
  "Упростить список карточек": ["Списочный вид карточек упрощён и приведён к единой компактной структуре."],
  "Переосмыслить главную страницу": ["Главная страница переработана с сохранением фирменного стиля MIDGAS."],
  "Исправить мобильный список карточек": ["Исправлены компоновка и номера карточек в мобильном списке."],
  "Этап 1: подготовить базу к редизайну": ["Кодовая база очищена и подготовлена к последовательному редизайну."],
  "Этап 2: создать дизайн-систему": ["Создана единая дизайн-система сайта."],
  "Этап 3: внедрить ролевую авторизацию": ["Внедрена ролевая авторизация пользователей, редакторов и администраторов."],
  "Этап 4: унифицировать шапку сайта": ["Шапка унифицирована на всех страницах и устройствах."],
  "Этап 5: создать ролевой личный кабинет": ["Создан личный кабинет с интерфейсом, соответствующим роли пользователя."],
  "Этап 6: пересобрать систему редактирования": ["Система редактирования пересобрана вокруг простых сценариев добавления контента."],
  "Этап 7: унифицировать структуру досье": ["Структура досье унифицирована для клиентов, аномалий и инцидентов."],
  "Этап 8: добавить медиагалерею досье": ["В досье добавлена медиагалерея с поддержкой дополнительных изображений."],
  "Этап 9: унифицировать уровни и стабилизировать сессию": ["Показатели уровней унифицированы, а пользовательская сессия стабилизирована."],
  "Этап 10: создать новый первый экран": ["Первый экран главной страницы создан заново."],
  "Этап 11: пересобрать главную и исправить доступ к данным": ["Главная страница пересобрана, а доступ к данным исправлен."],
  "Этап 12: оставить на доске только существующие сущности": ["На доске связей оставлены только существующие сущности реестра."],
  "Этап 13: добавить спокойные микровзаимодействия": ["Добавлены спокойные микровзаимодействия без лишней визуальной нагрузки."],
  "Этап 14: ускорить данные и мобильный рендер": ["Ускорены загрузка данных и отрисовка интерфейса на мобильных устройствах."],
  "Пересобрать первый экран и блок связей": ["Пересобраны первый экран главной страницы и блок доски связей."],
  "Исправить редактор, шкалы и защищенные разделы": ["Исправлены редактор, показатели уровней и доступ к защищённым разделам."],
  "Разделить редактор и журнал изменений": ["Меню редактирования и журнал изменений разделены на самостоятельные интерфейсы."],
  "Этап 15: зафиксировать финальную проверку": ["Завершена финальная проверка основных страниц и пользовательских сценариев."],
  "Перенести актуальные темы под партнеров": ["Блок актуальных тем перенесён под раздел партнёров."],
  "Исправить досье, архив и редактор контента": ["Исправлены страницы досье, Исторический архив и редактор контента."],
  "Исправить доступ редакторов и редактирование контента": ["Исправлены права редакторов и операции редактирования контента."],
  "Ускорить главную и обновить анимации сайта": ["Ускорена главная страница и обновлены анимации сайта."],
  "Исправить загрузку обложек новых карточек": ["Исправлена загрузка обложек у новых карточек."],
  "Исправить кабинет и добавить аватарки аккаунтов": ["Исправлена работа личного кабинета и добавлено оформление профилей."],
  "Update website": ["Обновлены интерфейс, данные и основные пользовательские сценарии сайта."],
  "Единые аватары и плавная анимация сайта": ["Профили получили единые аватары, а анимации сайта стали плавнее."],
  "Профиль пользователя в шапке сайта": ["Профиль пользователя с именем и инициалом добавлен в шапку сайта на компьютерах."],
};

const excludedHashes = new Set(["25e2732", "70fb7ca", "3763480", "c9e952e", "8b6e069"]);

function stripTechnicalLabels(value) {
  return String(value || "")
    .replace(/(?:^|\s)(?:этап|stage)\s*\d+\s*[:—–-]?\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeResultText(value) {
  const text = stripTechnicalLabels(value);
  if (!text) return "Обновлён сайт";
  return text
    .replace(/^Исправить\b/i, "Исправлено:")
    .replace(/^Добавить\b/i, "Добавлено:")
    .replace(/^Удалить\b|^Убрать\b/i, "Удалено:")
    .replace(/^Вернуть\b|^Восстановить\b/i, "Восстановлено:")
    .replace(/^Перенести\b/i, "Перенесено:")
    .replace(/^Обновить\b/i, "Обновлено:")
    .replace(/^Улучшить\b/i, "Улучшено:")
    .replace(/^Упростить\b/i, "Упрощено:")
    .replace(/^Переработать\b|^Переделать\b|^Пересобрать\b|^Переосмыслить\b/i, "Переработано:")
    .replace(/^Проверить\b/i, "Проверено:")
    .replace(/^Настроить\b/i, "Настроено:")
    .replace(/^Подключить\b/i, "Подключено:")
    .replace(/^Синхронизировать\b/i, "Синхронизировано:")
    .replace(/^Оптимизировать\b|^Ускорить\b/i, "Оптимизировано:")
    .replace(/^Сделать\b/i, "Обновлено:");
}

function localizeTitle(subject) {
  if (titleTranslations[subject]) return titleTranslations[subject];
  if (/[А-Яа-яЁё]/.test(subject)) return subject;
  return "Обновлён сайт";
}

function getEntryChanges(subject) {
  return (descriptions[subject] || [localizeTitle(subject)])
    .map(normalizeResultText)
    .filter(Boolean);
}

const output = execFileSync("git", ["log", "--no-merges", "--reverse", "--date=iso-strict", "--pretty=format:%H%x1f%ad%x1f%s%x1e"], { encoding: "utf8" });
const deployments = output.split("\x1e")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .filter((entry) => !excludedHashes.has(entry.split("\x1f")[0].slice(0, 7)))
  .map((entry, index) => {
    const [hash, date, subject] = entry.split("\x1f");
    const changes = getEntryChanges(subject);
    return {
      revision: index + 1,
      hash: hash.slice(0, 8),
      date,
      title: (changes[0] || normalizeResultText(localizeTitle(subject))).replace(/[.!?]+$/, ""),
      changes,
    };
  }).reverse();

writeFileSync(resolve("web/deploy-history.js"), `window.MIDGAS_DEPLOY_HISTORY = ${JSON.stringify(deployments, null, 2)};\n`, "utf8");
