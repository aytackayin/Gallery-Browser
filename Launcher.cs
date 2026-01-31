using System;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;
using System.IO;
using System.Linq;

public class GalleryTrayApp : ApplicationContext
{
    private NotifyIcon trayIcon;
    private Process npmProcess;
    private string appPath;

    private string browserPath = "default";

    public GalleryTrayApp()
    {
        appPath = AppDomain.CurrentDomain.BaseDirectory;
        
        // Ayarları Oku
        string language = "en";
        try {
            string configPath = Path.Combine(appPath, "config.ini");
            if (File.Exists(configPath)) {
                var lines = File.ReadAllLines(configPath);
                var langLine = lines.FirstOrDefault(l => l.Trim().StartsWith("Language="));
                if (langLine != null) language = langLine.Split('=')[1].Trim().ToLower();

                var bLine = lines.FirstOrDefault(l => l.Trim().StartsWith("BrowserPath="));
                if (bLine != null) browserPath = bLine.Split('=')[1].Trim();
            }
        } catch { }

        // Çevirileri Oku
        string trayOpenText = "Open Gallery";
        string trayExitText = "Exit";
        string trayRestartText = "Restart";
        try {
            string langFilePath = Path.Combine(appPath, "languages", language + ".json");
            if (File.Exists(langFilePath)) {
                string json = File.ReadAllText(langFilePath);
                trayOpenText = GetJsonValue(json, "trayOpen") ?? trayOpenText;
                trayExitText = GetJsonValue(json, "trayExit") ?? trayExitText;
                trayRestartText = GetJsonValue(json, "trayRestart") ?? trayRestartText;
            }
        } catch { }
        
        ContextMenu trayMenu = new ContextMenu();
        trayMenu.MenuItems.Add(trayOpenText, OnOpen);
        trayMenu.MenuItems.Add(trayRestartText, OnRestart);
        trayMenu.MenuItems.Add("-");
        trayMenu.MenuItems.Add(trayExitText, OnExit);

        trayIcon = new NotifyIcon()
        {
            ContextMenu = trayMenu,
            Text = "NetFree Gallery",
            Visible = true
        };

        try {
            string iconPath = Path.Combine(appPath, "icon.png");
            if (File.Exists(iconPath)) {
                using (Bitmap bmp = new Bitmap(iconPath)) {
                    trayIcon.Icon = Icon.FromHandle(bmp.GetHicon());
                }
            } else {
                trayIcon.Icon = SystemIcons.Application;
            }
        } catch {
            trayIcon.Icon = SystemIcons.Application;
        }

        trayIcon.DoubleClick += OnOpen;
        StartServer();
    }

    private string GetJsonValue(string json, string key)
    {
        try {
            string pattern = "\"" + key + "\":\\s*\"([^\"]*)\"";
            var match = System.Text.RegularExpressions.Regex.Match(json, pattern);
            return match.Success ? match.Groups[1].Value : null;
        } catch { return null; }
    }

    private void OpenUrl(string url)
    {
        try {
            if (string.IsNullOrEmpty(browserPath) || browserPath.ToLower() == "default") {
                Process.Start(url);
            } else {
                // Eğer tırnaklar yoksa ve boşluk varsa tırnak içine al (Yolun kendisi tırnaklı gelmiş olabilir)
                string cleanPath = browserPath.Trim('\"');
                Process.Start("\"" + cleanPath + "\"", url);
            }
        } catch (Exception ex) {
            // Fallback: Hata olursa varsayılanla açmaya çalış
            try { Process.Start(url); } catch { }
        }
    }

    private void StartServer()
    {
        try {
            ProcessStartInfo startInfo = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c npm run start",
                WorkingDirectory = appPath,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };

            npmProcess = new Process { StartInfo = startInfo };
            npmProcess.Start();
            
            Timer t = new Timer();
            t.Interval = 4000;
            t.Tick += (s, e) => {
                OpenUrl("http://localhost:3000");
                t.Stop();
            };
            t.Start();
        }
        catch { }
    }

    private void OnOpen(object sender, EventArgs e)
    {
        OpenUrl("http://localhost:3000");
    }

    private void OnRestart(object sender, EventArgs e)
    {
        KillServer();
        StartServer();
    }

    private void KillServer()
    {
        if (npmProcess != null && !npmProcess.HasExited) {
            try { npmProcess.Kill(); } catch { }
        }
        ProcessStartInfo killNode = new ProcessStartInfo {
            FileName = "taskkill", Arguments = "/F /IM node.exe /T",
            CreateNoWindow = true, UseShellExecute = false
        };
        try { 
            Process p = Process.Start(killNode);
            if (p != null) p.WaitForExit();
        } catch { }
    }

    private void OnExit(object sender, EventArgs e)
    {
        KillServer();
        trayIcon.Visible = false;
        Application.Exit();
    }

    [STAThread]
    static void Main()
    {
        using (System.Threading.Mutex mutex = new System.Threading.Mutex(false, "Global\\NetFreeGalleryLauncherMutex")) {
            if (!mutex.WaitOne(0, false)) {
                return;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new GalleryTrayApp());
        }
    }
}
