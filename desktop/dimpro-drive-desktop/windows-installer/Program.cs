using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Dimpro.DriveDesktop.Setup
{
    internal static class Program
    {
        private const string ServerUrl = "https://drive.dev.dimpro.hu";
        private const string ResourceName = "DIMPRO.DriveDesktop.Handler.ps1";

        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm());
        }

        private sealed class SetupForm : Form
        {
            private readonly TextBox pathBox;
            private readonly Button installButton;
            private string configuredAt;

            public SetupForm()
            {
                Text = "DIMPRO Drive Desktop telepítése";
                StartPosition = FormStartPosition.CenterScreen;
                ClientSize = new Size(680, 285);
                MinimumSize = new Size(680, 325);
                MaximizeBox = false;
                MinimizeBox = false;
                ShowIcon = false;
                TopMost = true;
                Font = new Font("Segoe UI", 9F);

                Label title = new Label();
                title.Text = "DIMPRO Drive Desktop";
                title.Font = new Font("Segoe UI", 16F, FontStyle.Bold);
                title.AutoSize = true;
                title.Location = new Point(24, 20);
                Controls.Add(title);

                Label intro = new Label();
                intro.Text = "A telepítő beállítja a Windows-megnyitást és a helyi DIMPRO munkafájlok mappáját.";
                intro.AutoSize = false;
                intro.Size = new Size(625, 40);
                intro.Location = new Point(26, 58);
                Controls.Add(intro);

                Label pathLabel = new Label();
                pathLabel.Text = "Munkafájlok helye:";
                pathLabel.AutoSize = true;
                pathLabel.Location = new Point(26, 108);
                Controls.Add(pathLabel);

                pathBox = new TextBox();
                pathBox.ReadOnly = true;
                pathBox.Location = new Point(28, 130);
                pathBox.Size = new Size(480, 25);
                Controls.Add(pathBox);

                Button browseButton = new Button();
                browseButton.Text = "Mappa kiválasztása...";
                browseButton.Location = new Point(518, 128);
                browseButton.Size = new Size(135, 29);
                browseButton.Click += delegate { BrowseFolder(); };
                Controls.Add(browseButton);

                Label note = new Label();
                note.Text = "A teljes Drive nem kerül a gépre. Csak a Windowsban megnyitott fájlok kerülnek a kiválasztott mappába.";
                note.AutoSize = false;
                note.Size = new Size(625, 42);
                note.Location = new Point(26, 172);
                Controls.Add(note);

                Button cancelButton = new Button();
                cancelButton.Text = "Mégsem";
                cancelButton.Location = new Point(453, 228);
                cancelButton.Size = new Size(90, 32);
                cancelButton.DialogResult = DialogResult.Cancel;
                Controls.Add(cancelButton);

                installButton = new Button();
                installButton.Text = "Telepítés";
                installButton.Location = new Point(553, 228);
                installButton.Size = new Size(100, 32);
                installButton.Enabled = false;
                installButton.Click += delegate { Install(); };
                Controls.Add(installButton);

                AcceptButton = installButton;
                CancelButton = cancelButton;

                LoadExistingConfiguration();
            }

            private string InstallRoot
            {
                get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DIMPRO", "DriveDesktop"); }
            }

            private string ConfigPath
            {
                get { return Path.Combine(InstallRoot, "config.json"); }
            }

            private string HandlerPath
            {
                get { return Path.Combine(InstallRoot, "open-handler.ps1"); }
            }

            private void LoadExistingConfiguration()
            {
                try
                {
                    if (!File.Exists(ConfigPath)) return;
                    JavaScriptSerializer serializer = new JavaScriptSerializer();
                    ConfigModel model = serializer.Deserialize<ConfigModel>(File.ReadAllText(ConfigPath, Encoding.UTF8));
                    if (model != null)
                    {
                        configuredAt = model.configuredAt;
                        if (!String.IsNullOrWhiteSpace(model.workFilesRoot))
                        {
                            pathBox.Text = model.workFilesRoot;
                            installButton.Enabled = true;
                        }
                    }
                }
                catch
                {
                }
            }

            private void BrowseFolder()
            {
                using (FolderBrowserDialog dialog = new FolderBrowserDialog())
                {
                    dialog.Description = "Válaszd ki a DIMPRO helyi munkafájlok mappáját.";
                    dialog.ShowNewFolderButton = true;
                    if (!String.IsNullOrWhiteSpace(pathBox.Text) && Directory.Exists(pathBox.Text))
                        dialog.SelectedPath = pathBox.Text;

                    DialogResult result = dialog.ShowDialog(this);
                    if (result == DialogResult.OK && !String.IsNullOrWhiteSpace(dialog.SelectedPath))
                    {
                        pathBox.Text = Path.GetFullPath(dialog.SelectedPath);
                        installButton.Enabled = true;
                    }
                }
            }

            private void Install()
            {
                try
                {
                    if (String.IsNullOrWhiteSpace(pathBox.Text))
                    {
                        MessageBox.Show(this, "Előbb válaszd ki a munkafájlok mappáját.", "DIMPRO Drive Desktop", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }

                    string workRoot = Path.GetFullPath(pathBox.Text);
                    Directory.CreateDirectory(workRoot);
                    Directory.CreateDirectory(InstallRoot);

                    WriteEmbeddedHandler();
                    WriteConfiguration(workRoot);
                    RegisterProtocol();

                    MessageBox.Show(
                        this,
                        "A DIMPRO Drive Desktop telepítése sikeres.\r\n\r\nMunkafájlok helye:\r\n" + workRoot +
                        "\r\n\r\nA mappa később a Drive felület → Műveletek → Drive Desktop beállítások menüből módosítható.",
                        "DIMPRO Drive Desktop",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );

                    DialogResult = DialogResult.OK;
                    Close();
                }
                catch (Exception ex)
                {
                    MessageBox.Show(this, "A telepítés sikertelen.\r\n\r\n" + ex.Message, "DIMPRO Drive Desktop", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }

            private void WriteEmbeddedHandler()
            {
                Assembly assembly = Assembly.GetExecutingAssembly();
                using (Stream stream = assembly.GetManifestResourceStream(ResourceName))
                {
                    if (stream == null) throw new InvalidOperationException("A beépített Drive Desktop handler hiányzik.");
                    using (FileStream target = new FileStream(HandlerPath, FileMode.Create, FileAccess.Write, FileShare.None))
                    {
                        stream.CopyTo(target);
                    }
                }
            }

            private void WriteConfiguration(string workRoot)
            {
                JavaScriptSerializer serializer = new JavaScriptSerializer();
                string now = DateTime.UtcNow.ToString("o");
                ConfigModel model = new ConfigModel();
                model.schemaVersion = 1;
                model.serverUrl = ServerUrl;
                model.workFilesRoot = workRoot;
                model.configuredAt = String.IsNullOrWhiteSpace(configuredAt) ? now : configuredAt;
                model.updatedAt = now;
                model.semantics = "PARTIAL_WORKFILES_NOT_SYNC";
                File.WriteAllText(ConfigPath, serializer.Serialize(model), new UTF8Encoding(true));
            }

            private void RegisterProtocol()
            {
                string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
                if (!File.Exists(powershell)) throw new FileNotFoundException("A Windows PowerShell nem található.", powershell);

                using (RegistryKey protocol = Registry.CurrentUser.CreateSubKey(@"Software\Classes\dimpro-drive"))
                {
                    if (protocol == null) throw new InvalidOperationException("A dimpro-drive protokoll nem regisztrálható.");
                    protocol.SetValue("", "URL:DIMPRO Drive Protocol", RegistryValueKind.String);
                    protocol.SetValue("URL Protocol", "", RegistryValueKind.String);

                    using (RegistryKey command = protocol.CreateSubKey(@"shell\open\command"))
                    {
                        if (command == null) throw new InvalidOperationException("A dimpro-drive protokoll parancsa nem regisztrálható.");
                        string value = "\"" + powershell + "\" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"" + HandlerPath + "\" -Uri \"%1\"";
                        command.SetValue("", value, RegistryValueKind.String);
                    }
                }
            }
        }

        private sealed class ConfigModel
        {
            public int schemaVersion { get; set; }
            public string serverUrl { get; set; }
            public string workFilesRoot { get; set; }
            public string configuredAt { get; set; }
            public string updatedAt { get; set; }
            public string semantics { get; set; }
        }
    }
}
