<div dir="rtl">

# מדריך התקנה – TimerTabata

TimerTabata הוא טיימר אינטרוולים/טבטה לשולחן העבודה, עבור Windows ו-Linux. האפליקציה עובדת לגמרי בלי אינטרנט ובלי חשבון.

## אפשרות 1 – הורדת קובץ התקנה מוכן (מומלץ)

1. היכנסו ללשונית **Actions** במאגר: <https://github.com/NehorayM/timerTabata/actions>
2. פתחו את הריצה האחרונה של **CI** שהסתיימה בהצלחה (✓ ירוק) על הענף הרצוי.
3. בתחתית העמוד, תחת **Artifacts**, הורידו:
   - `release-windows-latest` – מכיל את קובץ ההתקנה ‎`TimerTabata-<גרסה>-win-x64.exe`.
   - `release-ubuntu-latest` – מכיל את ‎`.AppImage` ואת ‎`.deb`.
4. חלצו את קובץ ה-ZIP שהורדתם והמשיכו לפי מערכת ההפעלה שלכם (למטה).

> הורדת Artifacts דורשת התחברות ל-GitHub עם הרשאה למאגר.

### Windows 10/11

1. הפעילו את ‎`TimerTabata-<גרסה>-win-x64.exe`.
2. קובץ ההתקנה **אינו חתום דיגיטלית**, ולכן יופיע חלון SmartScreen ‏("Windows protected your PC").
   לחצו **More info** ואז **Run anyway**.
3. בחרו תיקיית התקנה (ברירת המחדל היא התקנה למשתמש הנוכחי בלבד, בלי הרשאות מנהל) וסיימו.
4. נוצרים קיצורי דרך בשולחן העבודה ובתפריט התחל בשם **TimerTabata**.

**הסרה:** הגדרות ← אפליקציות ← TimerTabata ← הסר.

### Linux – ‏Ubuntu/Debian (‏‎`.deb`, מומלץ)

```bash
sudo apt install ./TimerTabata-1.0.0-linux-amd64.deb
timertabata
```

האפליקציה תופיע גם בתפריט היישומים. **הסרה:** ‎`sudo apt remove timertabata`

### Linux – כל הפצה (‏AppImage, בלי התקנה)

```bash
chmod +x TimerTabata-1.0.0-linux-x86_64.AppImage
./TimerTabata-1.0.0-linux-x86_64.AppImage
```

- אם מופיעה שגיאה על **FUSE**: התקינו ‎`libfuse2` ‏(‎`sudo apt install libfuse2t64` ב-Ubuntu 24), או הריצו עם המשתנה
  ‎`APPIMAGE_EXTRACT_AND_RUN=1`.
- ב-**Ubuntu 24 ומעלה** ה-AppImage עלול להיסגר מיד בגלל הגבלת ה-sandbox של המערכת
  (הודעה על ‎`chrome-sandbox` / ‎`setuid sandbox`). עדיף להשתמש ב-‎`.deb`. אם חייבים AppImage, הריצו עם ‎`--no-sandbox`.

## אפשרות 2 – בנייה מקוד המקור

דרישות: **Node.js 22** ו-**git**. ב-Windows יש לבנות על Windows עצמו.

```bash
git clone -b claude/funny-johnson-7xbn36 https://github.com/NehorayM/timerTabata.git
cd timerTabata
npm ci
node node_modules/electron/install.js   # מוודא שקובץ Electron הורד

npm start                 # הרצה מיידית בלי התקנה (אחרי npm run build)
npm run dist:linux        # בונה release/*.AppImage ו-release/*.deb
npm run dist:win          # (ב-Windows) בונה release/*.exe
```

לאחר הבנייה התקינו את הקובץ מתיקיית ‎`release/` כמו באפשרות 1.

## בדיקה מהירה אחרי ההתקנה

1. לחצו **+** ← שנו את Work ל-‎`0:30` ← **Save** (‏Ctrl+S).
2. לחצו **START**: המסך הירוק (Prepare) צריך לספור לאחור, ואחריו מסך כתום-אדום (Work) עם צליל.
3. מקש **רווח** משהה וממשיך, ‏**←/→** מעבירים אינטרוול, ‏**L** נועל, ‏**M** פותח טיימר מיני.
4. ב-**Settings ← Desktop integration** מוצג אילו יכולות זמינות במחשב שלכם (מגש מערכת, Always on top, קיצורים גלובליים).

## הערות לפי מערכת

- **מגש מערכת ב-Linux:** דורש סביבה שתומכת ב-StatusNotifier ‏(KDE, ‏Cinnamon, ‏XFCE, או GNOME עם התוסף
  *AppIndicator*). בלי מגש, סגירת החלון בזמן אימון שואלת אם למזער או לצאת. הפעלה חוזרת של האפליקציה מחזירה את החלון הקיים.
- **Wayland:** "תמיד למעלה" וקיצורים גלובליים מוגבלים על ידי המערכת. אפשר להפעיל ב-Settings את
  **Use X11 (XWayland)** ולהפעיל מחדש את האפליקציה.
- **קיצור דרך לאימון** (בתפריט הכרטיס ← *Create shortcut*): ב-Windows נוצר ‎`.lnk` על שולחן העבודה.
  ב-Linux נוצר ‎`~/.local/share/applications/timertabata-workout-<id>.desktop`.

## היכן נשמרים הנתונים

| מערכת | תיקייה |
| --- | --- |
| Windows | ‎`%APPDATA%\TimerTabata` |
| Linux | ‎`~/.config/TimerTabata` |

התיקייה כוללת אימונים, הגדרות, היסטוריה, תמונות ונקודת שחזור של אימון פעיל. הסרת האפליקציה **לא** מוחקת את התיקייה.
כדי למחוק את כל הנתונים, מחקו אותה ידנית. כדי לגבות, העתיקו אותה. אימון בודד אפשר לשתף דרך *Share* ולייבא דרך Settings ← *Import workout*.

## פתרון תקלות

| בעיה | פתרון |
| --- | --- |
| האפליקציה לא נפתחת שוב אחרי סגירה | היא כנראה ממוזערת למגש. לחצו על האייקון במגש, או הפעילו אותה שוב (רק מופע אחד רץ) |
| אין צליל | בדקו ב-Settings ← Sound שהשתקה כבויה ושהעוצמה מעל 0, ולחצו *Test sound* |
| הודעה "Data recovered" | קובץ נתונים נפגם. האפליקציה טענה את הגיבוי האחרון ושמרה את הקובץ הפגום בשם ‎`*.corrupt-*` בתיקיית הנתונים |
| בהפעלה מופיע "Resume interrupted workout?" | האפליקציה נסגרה באמצע אימון. בחרו *Resume* להמשך (מושהה) או *Discard* |

</div>
