/**
 * Hebrew (he-IL) UI dictionary.
 *
 * Everything an operator or supervisor reads lives here. The dictionary is
 * deliberately typed as a flat `Record<string, string>` with a `t()` helper
 * that supports `{placeholder}` interpolation, so adding a locale later is a
 * matter of dropping in a sibling file.
 *
 * NOTE: operators are free to *type* names, product names and notes in Hebrew,
 * Arabic or English — those are never translated. Only chrome is localised.
 */

import { PAUSE_REASON_CODES, type PauseReasonCode } from '@/lib/domain/types';

export const he = {
  /* ---------------------------------------------------------------- brand */
  'app.name': 'שיפט',
  'app.tagline': 'מערכת מעקב ייצור וגיימיפיקציה לקווי מילוי ואריזה',
  'app.factory': 'מפעל חומרי ניקוי',
  'app.rtlBadge': 'עברית',

  /* ----------------------------------------------------------- navigation */
  'nav.station': 'תחנת עבודה',
  'nav.leaderboard': 'לוח דירוג',
  'nav.daily': 'סטטיסטיקה יומית',
  'nav.history': 'היסטוריה',
  'nav.admin': 'ניהול',
  'nav.reports': 'דוחות',
  'nav.tvMode': 'מצב מסך',
  'nav.exitTv': 'יציאה ממצב מסך',

  /* -------------------------------------------------------------- generic */
  'common.save': 'שמירה',
  'common.saving': 'שומר…',
  'common.saved': 'נשמר בהצלחה',
  'common.cancel': 'ביטול',
  'common.close': 'סגירה',
  'common.delete': 'מחיקה',
  'common.edit': 'עריכה',
  'common.add': 'הוספה',
  'common.create': 'יצירה',
  'common.confirm': 'אישור',
  'common.confirmDelete': 'אישור מחיקה',
  'common.search': 'חיפוש',
  'common.filter': 'סינון',
  'common.all': 'הכול',
  'common.none': 'ללא',
  'common.noneSelected': 'לא נבחרו',
  'common.loading': 'טוען נתונים…',
  'common.optional': 'אופציונלי',
  'common.required': 'שדה חובה',
  'common.yes': 'כן',
  'common.no': 'לא',
  'common.actions': 'פעולות',
  'common.total': 'סה״כ',
  'common.name': 'שם',
  'common.notes': 'הערות',
  'common.date': 'תאריך',
  'common.time': 'שעה',
  'common.status': 'סטטוס',
  'common.active': 'פעיל',
  'common.inactive': 'לא פעיל',
  'common.export': 'ייצוא',
  'common.exportCsv': 'ייצוא ל-CSV',
  'common.refresh': 'רענון',
  'common.retry': 'ניסיון חוזר',
  'common.empty': 'אין נתונים להצגה',
  'common.emptyHint': 'הנתונים יופיעו כאן ברגע שייווצרו.',
  'common.error': 'שגיאה',
  'common.unknownError': 'אירעה שגיאה בלתי צפויה. נסו שוב.',
  'common.units': 'יח׳',
  'common.of': 'מתוך',

  /* -------------------------------------------------------------- station */
  'station.title': 'תחנת עבודה — קווים פעילים',
  'station.subtitle': 'שני קווים במקביל. כל משטח שנרשם מזכה בנקודות את הצוות הפעיל באותו רגע.',
  'station.line': 'קו',
  'station.lineA': 'קו A',
  'station.lineB': 'קו B',
  'station.lineEmpty': 'הקו פנוי',
  'station.lineEmptyHint': 'אין אצווה פעילה בקו זה. פתחו אצווה חדשה כדי להתחיל לתעד.',
  'station.startBatch': 'פתיחת אצווה',
  'station.setupTitle': 'פתיחת אצווה חדשה',
  'station.setupProduct': 'בחירת מוצר',
  'station.setupProductPlaceholder': 'בחרו מוצר מהרשימה',
  'station.setupTeam': 'בחירת צוות',
  'station.setupTeamHint': 'סמנו את העובדים שמתחילים לעבוד באצווה זו.',
  'station.setupTeamCount': '{count} עובדים נבחרו',
  'station.setupNotes': 'הערות פתיחה',
  'station.setupSubmit': 'התחל אצווה',
  'station.noProducts': 'לא הוגדרו מוצרים. יש להוסיף מוצר במסך הניהול לפני פתיחת אצווה.',
  'station.noWorkers': 'לא הוגדרו עובדים פעילים. יש להוסיף עובדים במסך הניהול.',
  'station.elapsed': 'זמן מאז ההתחלה',
  'station.activeTime': 'זמן עבודה נטו',
  'station.pausedTime': 'זמן מושבת',
  'station.paused': 'בהשהיה',
  'station.running': 'פעיל',
  'station.pause': 'השהיה',
  'station.resume': 'חזרה לעבודה',
  'station.pauseReason': 'סיבת ההשהיה',
  'station.pauseReasonPlaceholder': 'בחרו סיבה מהרשימה',
  'station.pauseNote': 'הערה חופשית',
  'station.pauseStart': 'התחל השהיה',
  'station.pauseRunning': 'השהיה פעילה כעת',
  'station.addPallet': '+ הוסף משטח',
  'station.addPalletTitle': 'רישום משטח',
  'station.palletQuickPick': 'בחרו גודל משטח — לחיצה אחת רושמת',
  'station.palletQuickPickHint': 'הקישו על משטח כדי לרשום אותו מיד. אין צורך באישור נוסף.',
  'station.palletCustomTitle': 'מספר קרטונים אחר',
  'station.palletCustomPlaceholder': 'הקלידו מספר קרטונים',
  'station.palletCustomLog': 'רשום משטח מותאם',
  'station.palletCustomHint': 'למשטח חלקי או לא סטנדרטי.',
  'station.palletStandardBadge': 'סטנדרטי',
  'station.palletTapToLog': 'הקישו לרישום',
  'station.palletSize': 'גודל משטח',
  'station.palletSizeCustom': 'מספר קרטונים מותאם אישית',
  'station.palletSizePlaceholder': 'בחרו גודל משטח',
  'station.palletCartons': 'מספר קרטונים',
  'station.palletCartonsPlaceholder': 'למשל 28',
  'station.palletNote': 'הערת משטח',
  'station.palletNotePlaceholder': 'הערה אופציונלית למשטח הבא',
  'station.palletPointsPreview': 'נקודות שיזכו',
  'station.palletSplitPreview': 'חלוקה בין {count} עובדים — {each} נק׳ לכל אחד',
  'station.palletNoTeam': 'לא ניתן לרשום משטח ללא צוות פעיל.',
  'station.palletSubmit': 'רשום משטח וזכה בנקודות',
  'station.palletLogged': 'המשטח נרשם — {points} נק׳ חולקו בין {count} עובדים',
  'station.palletLogFailed': 'רישום המשטח נכשל. נסו שוב.',
  'station.palletNoSizes': 'לא הוגדרו גדלי משטח למוצר זה. השתמשו ברישום מותאם.',
  'station.raceAttribution': 'נקודות נזקפות למרוץ',
  'station.noActiveRace': 'אין מרוץ פעיל — נקודות לא ייזקפו',
  'station.racesAttribution': 'נקודות נזקפות לכל המרוצים הפעילים',
  'station.racesAttributionList': 'נקודות ייזקפו במקביל ל: {races}',
  'station.palletSelected': 'המשטח הנבחר',
  'station.palletConfirm': 'אישור',
  'station.palletCancel': 'ביטול',
  'station.palletConfirmHint':
    'בחרו גודל משטח ואשרו. לא נרשם דבר עד ללחיצה על "אישור" — כך נמנעות רשומות כפולות.',
  'station.palletTapToSelect': 'הקישו לבחירה',
  'station.palletSelectedBadge': 'נבחר',
  'station.palletWillScore': 'ייזקף ל-{count} מרוצים',
  'station.palletWillScoreNone': 'לא ייזקפו נקודות — אין מרוץ פעיל',
  'station.palletSubmitting': 'רושם משטח…',
  'station.palletDismissed': 'הבחירה בוטלה',
  'station.palletsLogged': 'משטחים שנרשמו',
  'station.cartons': 'קרטונים',
  'station.points': 'נקודות',
  'station.pph': 'נק׳ לשעה',
  'station.team': 'צוות נוכחי',
  'station.teamChange': 'עדכון צוות',
  'station.teamAdd': 'הוספת עובד',
  'station.teamRemove': 'הסרה מהאצווה',
  'station.teamChangeHint': 'משטחים שנרשמו מהרגע הזה והלאה יתחלקו רק בין הצוות הפעיל.',
  'station.teamHistory': 'היסטוריית נוכחות באצווה',
  'station.joinedAt': 'הצטרף',
  'station.leftAt': 'עזב',
  'station.stillHere': 'נוכח',
  'station.finish': 'סיום אצווה',
  'station.finishConfirm': 'לסיים את האצווה? המשטחים והנקודות יישמרו בהיסטוריה.',
  'station.finishTitle': 'סיום אצווה',
  'station.finishNotes': 'הערות סיום',
  'station.finishSubmit': 'סיים ושמור בהיסטוריה',
  'station.cancelBatch': 'ביטול אצווה ללא שמירה',
  'station.cancelBatchConfirm': 'לבטל את האצווה? כל המשטחים והנקודות שנרשמו יימחקו.',
  'station.recentPallets': 'משטחים אחרונים',
  'station.pauseHistory': 'היסטוריית השבתות',
  'station.openPause': 'השהיה פתוחה',
  'station.teamPoints': 'נקודות הצוות באצווה',
  'station.liveBadge': 'שידור חי',
  'station.lastUpdate': 'עדכון אחרון',
  'station.offline': 'אין חיבור לשרת — הנתונים המוצגים הם מהעדכון האחרון.',
  'station.onLine': 'בקו',
  'station.tvIn': 'מצב מסך בעוד {seconds} שנ׳',

  /* ---------------------------------------------------------- leaderboard */
  'leaderboard.title': 'לוח דירוג',
  'leaderboard.race': 'מרוץ נוכחי',
  'leaderboard.active': 'מרוץ פעיל',
  'leaderboard.scopeActive': 'מרוצים פעילים',
  'leaderboard.scopeArchived': 'ארכיון',
  'leaderboard.scopeAll': 'הכל',
  'leaderboard.scopeHint': 'סינון רשימת המרוצים',
  'leaderboard.noArchived': 'אין מרוצים בארכיון',
  'leaderboard.noRacesInScope': 'אין מרוצים להצגה בסינון הזה',
  'leaderboard.noRace': 'אין מרוץ פעיל',
  'leaderboard.noRaceHint': 'מנהל המערכת יכול לפתוח מרוץ חדש במסך הניהול.',
  'leaderboard.prize': 'פרס',
  'leaderboard.startedAt': 'התחיל',
  'leaderboard.minHours': 'סף זכאות',
  'leaderboard.minHoursValue': '{hours} שעות פעילות',
  'leaderboard.volume': 'נפח',
  'leaderboard.volumeHint': 'סך הנקודות שנצברו במרוץ',
  'leaderboard.efficiency': 'יעילות — נקודות לשעה',
  'leaderboard.efficiencyHint': 'נקודות חלקי שעות עבודה נטו (PPH)',
  'leaderboard.rank': 'דירוג',
  'leaderboard.worker': 'עובד',
  'leaderboard.points': 'נקודות',
  'leaderboard.cartons': 'קרטונים',
  'leaderboard.pallets': 'משטחים',
  'leaderboard.batches': 'אצוות',
  'leaderboard.hours': 'שעות פעילות',
  'leaderboard.pph': 'נק׳ לשעה',
  'leaderboard.qualified': 'זכאי',
  'leaderboard.notQualified': 'לא זכאי',
  'leaderboard.qualifiedCount': '{qualified} מתוך {total} עובדים זכאים',
  'leaderboard.empty': 'אין נתונים במרוץ הנוכחי',
  'leaderboard.emptyHint': 'ברגע שיירשמו משטחים, הדירוג יתעדכן אוטומטית.',

  /* -------------------------------------------------------------- history */
  'history.title': 'היסטוריית אצוות',
  'history.subtitle': 'כל אצווה שהושלמה, כולל זמני עבודה, השבתות וחלוקת נקודות.',
  'history.startTime': 'התחלה',
  'history.finishTime': 'סיום',
  'history.elapsed': 'משך כולל',
  'history.activeTime': 'זמן עבודה',
  'history.pausedTime': 'זמן מושבת',
  'history.product': 'מוצר',
  'history.team': 'צוות',
  'history.points': 'נקודות',
  'history.cartons': 'קרטונים',
  'history.pauseBreakdown': 'פירוט השבתות',
  'history.race': 'מרוץ',
  'history.details': 'פרטים',
  'history.empty': 'עדיין לא הושלמו אצוות',
  'history.emptyHint': 'אצוות שיסתיימו בתחנת העבודה יופיעו כאן.',
  'history.filterFrom': 'מתאריך',
  'history.filterTo': 'עד תאריך',
  'history.filterProduct': 'מוצר',
  'history.filterWorker': 'עובד',
  'history.count': '{count} אצוות',
  'history.exportAll': 'ייצוא כל ההיסטוריה ל-CSV',

  /* ---------------------------------------------------------------- admin */
  'admin.title': 'ניהול המערכת',
  'admin.tabWorkers': 'עובדים',
  'admin.tabLines': 'קווי ייצור',
  'admin.tabProducts': 'מוצרים ומשטחים',
  'admin.tabRaces': 'מרוצים',
  'admin.tabSettings': 'הגדרות',
  'admin.tabReports': 'דוחות וייצוא',

  'admin.lines.title': 'ניהול קווי ייצור',
  'admin.lines.subtitle':
    'הקווים דינמיים לחלוטין — הוסיפו, שנו שם, סדרו או השביתו קווים. תחנת העבודה מציגה כרטיס לכל קו פעיל.',
  'admin.lines.add': 'הוספת קו',
  'admin.lines.edit': 'עריכת קו',
  'admin.lines.name': 'שם הקו',
  'admin.lines.namePlaceholder': 'לדוגמה: קו מילוי 3',
  'admin.lines.code': 'קוד קצר',
  'admin.lines.codeHint': 'אותיות באנגלית ומספרים בלבד. מופיע בטבלאות ובייצוא CSV.',
  'admin.lines.codePlaceholder': 'LINE_C',
  'admin.lines.sortOrder': 'סדר תצוגה',
  'admin.lines.isActive': 'קו פעיל',
  'admin.lines.active': 'פעיל',
  'admin.lines.inactive': 'מושבת',
  'admin.lines.running': 'מריץ אצווה כעת',
  'admin.lines.count': '{count} קווים',
  'admin.lines.activeCount': '{count} קווים פעילים',
  'admin.lines.deactivate': 'השבתה',
  'admin.lines.reactivate': 'הפעלה מחדש',
  'admin.lines.deleteConfirm': 'למחוק את הקו {name}? קו עם היסטוריית ייצור לא יימחק — יושבת במקום זאת.',
  'admin.lines.deleted': 'הקו נמחק',
  'admin.lines.deactivated': 'הקו הושבת כדי לשמור על ההיסטוריה',
  'admin.lines.moveUp': 'הזזה למעלה',
  'admin.lines.moveDown': 'הזזה למטה',
  'admin.lines.empty': 'לא הוגדרו קווי ייצור',
  'admin.lines.emptyHint': 'הוסיפו לפחות קו אחד כדי לפתוח אצוות בתחנת העבודה.',

  'admin.workers.title': 'ניהול עובדים',
  'admin.workers.subtitle': 'לכל עובד אימוג׳ ייחודי שמופיע לצד שמו בכל המסכים.',
  'admin.workers.add': 'הוספת עובד',
  'admin.workers.edit': 'עריכת עובד',
  'admin.workers.fullName': 'שם מלא',
  'admin.workers.fullNameHint': 'ניתן להקליד בעברית, בערבית או באנגלית.',
  'admin.workers.fullNamePlaceholder': 'לדוגמה: יוסי כהן / أحمد علي / Sami Levi',
  'admin.workers.employeeId': 'מספר עובד',
  'admin.workers.employeeIdPlaceholder': 'למשל 1024',
  'admin.workers.emoji': 'אימוג׳ אישי',
  'admin.workers.emojiHint': 'חייב להיות ייחודי — לא ניתן לשמור שני עובדים עם אותו אימוג׳.',
  'admin.workers.emojiTaken': 'האימוג׳ {emoji} כבר תפוס על ידי {name}.',
  'admin.workers.employeeIdTaken': 'מספר העובד {id} כבר קיים במערכת.',
  'admin.workers.pickEmoji': 'בחירת אימוג׳',
  'admin.workers.active': 'עובד פעיל',
  'admin.workers.deactivate': 'השבתה',
  'admin.workers.reactivate': 'הפעלה מחדש',
  'admin.workers.deleteConfirm': 'למחוק את {name}? עובד עם נתוני ייצור לא יימחק — יושבת במקום זאת.',
  'admin.workers.deleted': 'העובד נמחק',
  'admin.workers.deactivated': 'העובד הושבת כדי לשמור על ההיסטוריה',
  'admin.workers.searchPlaceholder': 'חיפוש לפי שם או מספר עובד',
  'admin.workers.count': '{count} עובדים',

  'admin.products.title': 'ניהול מוצרים ומשטחים',
  'admin.products.subtitle': 'לכל מוצר נפח, פריסת קרטונים, ערך נקודות וגודלי משטח מוגדרים מראש.',
  'admin.products.add': 'הוספת מוצר',
  'admin.products.edit': 'עריכת מוצר',
  'admin.products.name': 'שם המוצר',
  'admin.products.namePlaceholder': 'לדוגמה: נוזל רצפות 1 ליטר',
  'admin.products.sku': 'מק״ט',
  'admin.products.sizeLabel': 'נפח / גודל',
  'admin.products.sizeLabelPlaceholder': 'לדוגמה: 1 ליטר',
  'admin.products.cartonsPerLayout': 'קרטונים בפריסה',
  'admin.products.pointValue': 'ערך נקודות לקרטון',
  'admin.products.pointValueHint': 'מכפיל התחשבנות לפי מורכבות המוצר.',
  'admin.products.palletSizes': 'גדלי משטח מוגדרים מראש',
  'admin.products.palletSizesHint': 'לדוגמה: משטח A = 28 קרטונים, משטח B = 32 קרטונים.',
  'admin.products.addPalletSize': 'הוספת גודל משטח',
  'admin.products.palletLabel': 'תיאור',
  'admin.products.palletCartons': 'קרטונים',
  'admin.products.noPalletSizes': 'לא הוגדרו גדלי משטח למוצר זה.',
  'admin.products.deleteConfirm': 'למחוק את המוצר {name}? מוצר עם אצוות בהיסטוריה לא יימחק — יושבת במקום זאת.',
  'admin.products.count': '{count} מוצרים',
  'admin.products.deleted': 'המוצר נמחק',
  'admin.products.deactivated': 'המוצר הושבת כדי לשמור על ההיסטוריה',

  'admin.races.title': 'מרוצים ולוח דירוג',
  'admin.races.subtitle':
    'כל המרוצים הפעילים צוברים נקודות במקביל מכל האצוות. פתיחת מרוץ חדש מתחילה מ-0.',
  'admin.races.startNew': 'פתיחת מרוץ חדש',
  'admin.races.name': 'שם המרוץ',
  'admin.races.namePlaceholder': 'לדוגמה: מרוץ נובמבר',
  'admin.races.prize': 'תיאור הפרס',
  'admin.races.prizePlaceholder': 'לדוגמה: שובר 500 ₪ לצוות המוביל',
  'admin.races.startAt': 'תאריך התחלה',
  'admin.races.minHours': 'סף שעות פעילות לזכאות',
  'admin.races.minHoursHint': 'עובד שלא יצבר מספר שעות פעילות זה במרוץ לא ייכלל בדירוג היעילות.',
  'admin.races.active': 'מרוץ פעיל',
  'admin.races.finished': 'מרוץ שהסתיים',
  'admin.races.started': 'המרוץ נפתח. כל הנקודות אופסו ל-0.',
  'admin.races.history': 'מרוצים קודמים',
  'admin.races.noActive': 'אין מרוץ פעיל — נקודות לא ייזקפו עד לפתיחת מרוץ.',
  'admin.races.currentWinner': 'מוביל נוכחי',

  'admin.races.multipleHint':
    'ניתן להריץ כמה מרוצים במקביל. המרוץ הראשי הוא זה שנקודות חדשות נזקפות אליו.',
  'admin.races.primary': 'מרוץ ראשי',
  'admin.races.notPrimary': 'מרוץ משני',
  'admin.races.setPrimary': 'הגדר כברירת מחדל',
  'admin.races.primarySet': 'המרוץ הוגדר כברירת מחדל לתצוגה. כל המרוצים הפעילים ממשיכים לצבור נקודות.',
  'admin.races.activeCount': '{count} מרוצים פעילים',
  'admin.races.endDate': 'תאריך סיום',
  'admin.races.endDateHint': 'ריק = המרוץ פתוח ללא תאריך סיום.',
  'admin.races.archiveNote': 'הערת ארכיון',
  'admin.races.archiveNotePlaceholder': 'לדוגמה: הסתיים כמתוכנן, הוחלף במרוץ נובמבר',
  'admin.races.archivedNotice': 'המרוץ נסגר ועבר לארכיון.',
  'admin.races.overrides': 'מכפילי נקודות למרוץ הזה',
  'admin.races.overridesHint':
    'ערך נקודות שונה למוצר, רק בתוך המרוץ הזה. ריק = ברירת המחדל של המוצר.',
  'admin.races.overrideDefault': 'ברירת מחדל',
  'admin.races.overridesSaved': 'מכפילי הנקודות נשמרו.',
  'admin.races.selectRace': 'בחירת מרוץ',
  'admin.races.totals': 'סיכום המרוץ',
  'admin.races.archive': 'ארכיון',
  'admin.races.live': 'פעיל כעת',
  'admin.races.summaryHint': 'סך הנקודות, המשטחים והעובדים בכל מרוץ.',

  'admin.settings.title': 'הגדרות מערכת',
  'admin.settings.factoryName': 'שם המפעל',
  'admin.settings.tvIdle': 'זמן חוסר פעילות לפני מצב מסך (שניות)',
  'admin.settings.tvIdleHint':
    'לאחר מספר שניות ללא תזוזת עכבר או הקלדה, המסך עובר אוטומטית למצב מסך — בכל מסך באפליקציה.',
  'admin.settings.tvSlide': 'משך תצוגת שקופית במצב מסך (שניות)',
  'admin.settings.tvSlideHint':
    'כמה זמן כל שקופית נשארת על המסך לפני מעבר לשקופית הבאה. ברירת מחדל: 8 שניות.',
  'admin.settings.tvPanels': 'שקופיות במצב מסך',
  'admin.settings.tvPanelsHint':
    'בחרו אילו מסכים יופיעו במחזור מצב מסך. אפשר לבטל הכול כדי להשבית את מצב מסך.',
  'admin.settings.tvPanelsNone': 'לא נבחרה אף שקופית — מצב מסך לא יציג תוכן.',
  'admin.settings.tvPanelsCount': '{count} שקופיות נבחרו',
  'admin.settings.tvPanelEnableAll': 'בחירת הכול',
  'admin.settings.tvPanelClear': 'ניקוי',
  'admin.races.finish': 'סיום מרוץ',
  'admin.races.finishHint': 'המרוץ ייסגר ויעבור לארכיון. כל הנקודות והנתונים נשמרים.',
  'admin.races.finishConfirm':
    'לסיים את המרוץ ולהעביר אותו לארכיון? הנקודות וההיסטוריה יישמרו במלואן, וניתן יהיה לצפות בהן בכל עת.',
  'admin.races.finishedNotice': 'המרוץ הסתיים ועבר לארכיון.',
  'admin.races.delete': 'מחיקה',
  'admin.races.deleteHint': 'מחיקה סופית — כולל כל הנקודות שנצברו במרוץ.',
  'admin.races.deleteWarning':
    '⚠️ מחיקת המרוץ תמחק לצמיתות את כל הנקודות שנצברו בו. לא ניתן לשחזר. הנתונים האחרים (אצוות, משטחים, עובדים) אינם נפגעים.',
  'admin.races.deleteImpact': 'מה יימחק',
  'admin.races.deleteImpactPoints': '{points} נקודות',
  'admin.races.deleteImpactAwards': '{count} רשומות נקודות',
  'admin.races.deleteImpactPallets': '{count} משטחים',
  'admin.races.deleteImpactWorkers': '{count} עובדים',
  'admin.races.deleted': 'המרוץ נמחק',
  'admin.races.deletedWithAwards': 'המרוץ נמחק — הוסרו {count} רשומות נקודות.',
  'admin.races.deleteSuggestArchive': 'מעדיפים לשמור? השתמשו ב"סיום מרוץ" כדי להעביר לארכיון.',
  'admin.races.autoArchiveTitle': 'סיום אוטומטי',
  'admin.races.autoArchiveHint':
    'מרוץ שמגיע לתאריך הסיום שהוגדר לו נסגר ועובר אוטומטית לארכיון, ברגע שמסך כלשהו נטען.',
  'admin.races.autoArchived': 'הסתיים אוטומטית בהגיע מועד הסיום',
  'admin.races.endDateOptional': 'ללא תאריך סיום',
  'admin.races.willAutoArchive': 'יסתיים אוטומטית',
  'admin.races.expired': 'מועד הסיום עבר — ייסגר בטעינה הבאה',

  'admin.settings.defaultMinHours': 'סף שעות ברירת מחדל למרוץ חדש',
  'admin.settings.saved': 'ההגדרות נשמרו',
  'admin.settings.tvPreview': 'תצוגה מקדימה: {seconds} שניות לשקופית',

  'tv.panel.leaderboard_volume': 'דירוג נפח',
  'tv.panel.leaderboard_efficiency': 'דירוג יעילות',
  'tv.panel.active_batches': 'אצוות פעילות',
  'tv.panel.daily': 'ייצור היום לפי מוצר',
  'tv.panel.race_stats': 'סטטיסטיקת המרוץ',

  'admin.reports.title': 'דוחות וייצוא CSV',
  'admin.reports.subtitle': 'הורדת נתונים תפעוליים לשכר ולבדיקות ביצועים.',
  'admin.reports.batches': 'יומן אצוות מפורט',
  'admin.reports.batchesHint': 'כל אצווה: זמני התחלה וסיום, זמן עבודה, השבתות, מוצר, צוות ונקודות.',
  'admin.reports.workers': 'סיכום נקודות לעובד',
  'admin.reports.workersHint': 'סך נקודות, קרטונים, שעות פעילות ויעילות לכל עובד.',
  'admin.reports.downtime': 'דוח השבתות',
  'admin.reports.downtimeHint': 'פילוח זמני מושבת לפי סיבה, כולל מספר אירועים ומשך ממוצע.',
  'admin.reports.pallets': 'יומן משטחים',
  'admin.reports.palletsHint': 'כל משטח בנפרד, כולל חלוקת הנקודות בין חברי הצוות והמרוץ שאליו נזקף.',
  'admin.reports.daily': 'דוח ייצור יומי',
  'admin.reports.dailyHint':
    'סיכום יומי מלא: סיכום כללי, פילוח לפי מוצר (משטחים), פילוח לפי קו ועובדים בולטים — לקובץ אחד.',
  'admin.reports.download': 'הורדה',
  'admin.reports.rows': '{count} שורות',
  'admin.reports.periodFrom': 'מתאריך',
  'admin.reports.periodTo': 'עד תאריך',

  /* ------------------------------------------------------------- tv mode */
  'tv.title': 'לוח תוצאות חי',
  'tv.volumeBoard': 'דירוג נפח',
  'tv.efficiencyBoard': 'דירוג יעילות',
  'tv.activeBatches': 'אצוות פעילות',
  'tv.factoryStats': 'סטטיסטיקת המרוץ',
  'tv.dailyBoard': 'ייצור היום לפי מוצר',
  'tv.hint': 'הזיזו עכבר או לחצו מקש כדי לחזור לתחנת העבודה',
  'tv.exitingIn': 'חזרה לתחנה בעוד {seconds} שנ׳',
  'tv.raceLabel': 'מרוץ',
  'tv.prizeLabel': 'פרס',
  'tv.noData': 'אין נתונים להצגה',
  'tv.panel': 'שקופית {index} מתוך {total}',
  'tv.slideSeconds': '{seconds} שנ׳ לשקופית',

  /* ---------------------------------------------------------------- daily */
  'daily.title': 'סטטיסטיקה יומית',
  'daily.subtitle': 'התפלגות הייצור היומי לפי מוצר, קו, שעה ועובד. משטחים הם המדד המוביל.',
  'daily.date': 'תאריך',
  'daily.today': 'היום',
  'daily.yesterday': 'אתמול',
  'daily.palletsProduced': 'משטחים שיוצרו',
  'daily.pallets': 'משטחים',
  'daily.cartons': 'קרטונים',
  'daily.points': 'נקודות',
  'daily.byProduct': 'פילוח לפי מוצר',
  'daily.byProductHint': 'מוצר ← מספר המשטחים שיוצרו היום.',
  'daily.byLine': 'פילוח לפי קו',
  'daily.byHour': 'פילוח לפי שעה',
  'daily.topWorkers': 'עובדים בולטים היום',
  'daily.batchesRunning': 'אצוות פעילות',
  'daily.batchesCompleted': 'אצוות שהושלמו',
  'daily.activeTime': 'זמן עבודה',
  'daily.pausedTime': 'זמן מושבת',
  'daily.workersOnFloor': 'עובדים שצברו נקודות',
  'daily.share': 'נתח',
  'daily.noProduction': 'לא נרשמו משטחים ביום זה',
  'daily.noProductionHint': 'בחרו תאריך אחר, או רשמו משטחים בתחנת העבודה.',
  'daily.selectDate': 'בחירת תאריך',
  'daily.exportCsv': 'ייצוא הדוח היומי',
  'daily.print': 'הדפסה',
  'daily.peakHour': 'שעת שיא',
  'daily.avgPerHour': 'ממוצע משטחים לשעה',
  'daily.topProduct': 'מוצר מוביל',

  /* ---------------------------------------------------------------- chart */
  'chart.axisPoints': 'נקודות',
  'chart.axisCartons': 'קרטונים',
  'chart.axisPallets': 'משטחים',
  'chart.axisHours': 'שעות',
  'chart.last14days': '14 הימים האחרונים',

  /* -------------------------------------------------------------- errors */
  'error.validation': 'הנתונים שהוזנו אינם תקינים.',
  'error.workerEmojiDuplicate': 'האימוג׳ הזה כבר בשימוש. בחרו אימוג׳ אחר.',
  'error.workerEmployeeIdDuplicate': 'מספר העובד הזה כבר קיים.',
  'error.workerInUse': 'לא ניתן למחוק עובד עם נתוני ייצור. ניתן להשבית אותו.',
  'error.productInUse': 'לא ניתן למחוק מוצר עם אצוות בהיסטוריה. ניתן להשבית אותו.',
  'error.lineBusy': 'קו זה כבר מריץ אצווה פעילה.',
  'error.lineCodeDuplicate': 'קוד הקו הזה כבר קיים. בחרו קוד אחר.',
  'error.lineRunning': 'לא ניתן למחוק קו שמריץ אצווה פעילה כרגע. יש לסיים או לבטל את האצווה.',
  'error.lineRequired': 'יש להגדיר לפחות קו ייצור אחד פעיל לפני פתיחת אצווה.',
  'error.noActiveRace': 'אין מרוץ פעיל. פתחו מרוץ חדש במסך הניהול.',
  'error.batchNotActive': 'האצווה אינה פעילה.',
  'error.batchAlreadyPaused': 'האצווה כבר בהשהיה.',
  'error.batchNotPaused': 'האצווה אינה בהשהיה.',
  'error.teamEmpty': 'חייב להישאר לפחות עובד אחד באצווה.',
  'error.workerAlreadyOnBatch': 'העובד כבר נמצא באצווה זו.',
  'error.invalidCartons': 'מספר הקרטונים חייב להיות מספר שלם גדול מ-0.',
  'error.notFound': 'הפריט המבוקש לא נמצא.',
  'error.databaseUnavailable': 'בסיס הנתונים אינו זמין. בדקו את משתני הסביבה.',
  'error.raceAlreadyFinished': 'המרוץ הזה כבר הסתיים.',
  'error.racePrimaryRequired': 'חייב להיות מרוץ ראשי פעיל אחד כדי לרשום נקודות.',
} as const;

export type HeKey = keyof typeof he;

/** Interpolates `{placeholders}` in a dictionary string. */
export function t(key: HeKey, params?: Record<string, string | number>): string {
  const template: string = he[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, token: string) => {
    const value = params[token];
    return value === undefined ? match : String(value);
  });
}

/* -------------------------------------------------------------------------- */
/*  Pause reasons                                                             */
/* -------------------------------------------------------------------------- */

export const PAUSE_REASON_LABELS: Record<PauseReasonCode, string> = {
  BOTTLE_MATERIAL_SHORTAGE: 'חסר בקבוקים / חומרי גלם',
  MACHINE_MAINTENANCE: 'תחזוקת מכונה',
  CHANGEOVER_CLEANING: 'החלפה / ניקיון',
  WORKER_BREAK: 'הפסקת עובדים',
  QUALITY_HOLD: 'החזקת איכות',
  OTHER: 'אחר',
};

export const PAUSE_REASON_OPTIONS: Array<{ value: PauseReasonCode; label: string }> =
  PAUSE_REASON_CODES.map((code) => ({ value: code, label: PAUSE_REASON_LABELS[code] }));

export function pauseReasonLabel(code: PauseReasonCode): string {
  return PAUSE_REASON_LABELS[code] ?? PAUSE_REASON_LABELS.OTHER;
}

/* -------------------------------------------------------------------------- */
/*  Line helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Fallback labels for the two lines the seed creates.
 *
 * Lines are dynamic records with a supervisor-editable `name`, so this map is
 * only used when a caller holds a bare code (a legacy CSV column, or a log line)
 * and no `ProductionLine` row to read the display name from.
 */
const LEGACY_LINE_LABELS: Record<string, string> = {
  LINE_A: 'קו A',
  LINE_B: 'קו B',
  LINE_C: 'קו מילוי 3',
};

export function lineLabel(code: string, fallbackName?: string): string {
  if (fallbackName?.trim()) return fallbackName;
  return LEGACY_LINE_LABELS[code] ?? code;
}

/* -------------------------------------------------------------------------- */
/*  Emoji palette for the worker picker                                       */
/* -------------------------------------------------------------------------- */

/**
 * A curated, visually distinct palette. Kept large enough that a typical
 * factory crew can each take a unique emoji without collisions, while all
 * glyphs render identically on Windows and Android tablets.
 */
export const EMOJI_PALETTE: string[] = [
  '🦁', '🐯', '🐻', '🐼', '🐨', '🦊', '🐺', '🐸', '🐵', '🦉',
  '🦅', '🦈', '🐬', '🐙', '🦋', '🐝', '🐞', '🦖', '🐢', '🦜',
  '⚡', '🔥', '💧', '🌊', '⛰️', '🌪️', '🌈', '⭐', '🌟', '✨',
  '🔧', '🔩', '⚙️', '🛠️', '🔨', '🪛', '🧰', '🚧', '🏗️', '🏭',
  '🚀', '✈️', '🚚', '🚜', '🏎️', '🚲', '🛴', '⛵', '🎯', '🎳',
  '🥇', '🏆', '🏅', '🎖️', '👑', '💎', '🧿', '🍀', '🌻', '🌵',
  '🍎', '🍊', '🍋', '🍉', '🍇', '🍓', '🥑', '🌶️', '🍯', '🧊',
  '🎸', '🥁', '🎺', '🎧', '🎲', '🧩', '♟️', '🎮', '🕹️', '🧸',
];
