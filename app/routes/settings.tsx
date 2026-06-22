import { useState } from "react";
import { useAuth } from "~/providers/auth";
import { useVault } from "~/providers/vault";
import { useToast } from "~/providers/toast";
import { mockUpdateEmail, mockUpdateAccountPassword } from "~/lib/api";
import {
  calculatePasswordStrength,
  strengthColors,
  strengthLabels,
} from "~/utils/calculatePasswordStrength";
import AccordionSection from "~/components/Accordion";
import { requireAuth } from "~/lib/auth-guard";
import type { Route } from "./+types/settings";

export const clientLoader = () => {
  requireAuth();
  return null;
};

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Settings - LockKeep" },
    {
      name: "description",
      content:
        "Manage your LockKeep account settings, change your master password, and update security preferences.",
    },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export default function Settings() {
  const { user, login } = useAuth();
  const { isLocked, changeMasterPassword } = useVault();
  const { addToast } = useToast();

  const [openSection, setOpenSection] = useState<string | null>("account");

  const [email, setEmail] = useState(user?.email || "");
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);

  const [currentAccountPassword, setCurrentAccountPassword] = useState("");
  const [newAccountPassword, setNewAccountPassword] = useState("");
  const [confirmAccountPassword, setConfirmAccountPassword] = useState("");
  const [isChangingAccountPassword, setIsChangingAccountPassword] =
    useState(false);

  const [currentMasterPassword, setCurrentMasterPassword] = useState("");
  const [newMasterPassword, setNewMasterPassword] = useState("");
  const [confirmMasterPassword, setConfirmMasterPassword] = useState("");
  const [isChangingMasterPassword, setIsChangingMasterPassword] =
    useState(false);
  const [masterPasswordStrength, setMasterPasswordStrength] = useState(0);

  const isOAuth =
    user?.email.startsWith("google_") || user?.email.startsWith("github_");

  const handleEmailUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isOAuth) return;

    setIsUpdatingEmail(true);
    try {
      const result = await mockUpdateEmail(user.id, email);
      login(result.user);
      addToast("Email updated successfully", "success");
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : "Failed to update email",
        "error",
      );
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  const handleAccountPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newAccountPassword !== confirmAccountPassword) {
      addToast("Passwords do not match", "error");
      return;
    }

    if (newAccountPassword.length < 8) {
      addToast("Password must be at least 8 characters", "error");
      return;
    }

    setIsChangingAccountPassword(true);
    try {
      await mockUpdateAccountPassword(
        user!.id,
        currentAccountPassword,
        newAccountPassword,
      );
      addToast("Account password changed successfully", "success");
      setCurrentAccountPassword("");
      setNewAccountPassword("");
      setConfirmAccountPassword("");
    } catch (err) {
      addToast(
        err instanceof Error
          ? err.message
          : "Failed to change account password",
        "error",
      );
    } finally {
      setIsChangingAccountPassword(false);
    }
  };

  const handleMasterPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newMasterPassword.length < 12) {
      addToast("New master password must be at least 12 characters", "error");
      return;
    }

    if (newMasterPassword !== confirmMasterPassword) {
      addToast("New master passwords do not match", "error");
      return;
    }

    if (masterPasswordStrength < 3) {
      addToast("Please use a stronger master password", "error");
      return;
    }

    if (isLocked) {
      addToast("Vault must be unlocked to change master password", "error");
      return;
    }

    setIsChangingMasterPassword(true);
    try {
      await changeMasterPassword(currentMasterPassword, newMasterPassword);
      addToast(
        "Master password changed successfully. All credentials re-encrypted.",
        "success",
      );
      setCurrentMasterPassword("");
      setNewMasterPassword("");
      setConfirmMasterPassword("");
      setMasterPasswordStrength(0);
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : "Failed to change master password",
        "error",
      );
    } finally {
      setIsChangingMasterPassword(false);
    }
  };

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-8 text-3xl font-bold text-slate-100">Settings</h1>

      {/* Account Accordion */}
      <AccordionSection
        id="account"
        title="Account"
        isOpen={openSection === "account"}
        onToggle={() => toggleSection("account")}
      >
        {isOAuth ? (
          <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-4">
            <p className="text-sm text-sky-300">
              Your account is managed by{" "}
              {user?.email.startsWith("google_") ? "Google" : "GitHub"} OAuth.
              Email and account password cannot be changed here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <form onSubmit={handleEmailUpdate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-400">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 focus:border-sky-400 focus:outline-none"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isUpdatingEmail || email === user?.email}
                  className="rounded-lg bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:opacity-50"
                >
                  {isUpdatingEmail ? "Updating..." : "Update Email"}
                </button>
              </div>
            </form>

            <div className="h-px bg-slate-800" />

            <form
              onSubmit={handleAccountPasswordChange}
              className="flex flex-col gap-4"
            >
              <h3 className="text-sm font-medium text-slate-400">
                Change Account Password
              </h3>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-500">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentAccountPassword}
                  onChange={(e) => setCurrentAccountPassword(e.target.value)}
                  required
                  className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 focus:border-sky-400 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-500">New Password</label>
                <input
                  type="password"
                  value={newAccountPassword}
                  onChange={(e) => setNewAccountPassword(e.target.value)}
                  required
                  placeholder="At least 8 characters"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-400 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-500">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmAccountPassword}
                  onChange={(e) => setConfirmAccountPassword(e.target.value)}
                  required
                  className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 focus:border-sky-400 focus:outline-none"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isChangingAccountPassword}
                  className="rounded-lg bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:opacity-50"
                >
                  {isChangingAccountPassword
                    ? "Updating..."
                    : "Change Password"}
                </button>
              </div>
            </form>
          </div>
        )}
      </AccordionSection>

      {/* Vault Security Accordion */}
      <AccordionSection
        id="vault"
        title="Vault Security"
        isOpen={openSection === "vault"}
        onToggle={() => toggleSection("vault")}
      >
        <form
          onSubmit={handleMasterPasswordChange}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-400">
              Current Master Password
            </label>
            <input
              type="password"
              value={currentMasterPassword}
              onChange={(e) => setCurrentMasterPassword(e.target.value)}
              required
              className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 focus:border-sky-400 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-400">
              New Master Password
            </label>
            <input
              type="password"
              value={newMasterPassword}
              onChange={(e) => {
                setNewMasterPassword(e.target.value);
                setMasterPasswordStrength(
                  calculatePasswordStrength(e.target.value),
                );
              }}
              required
              placeholder="Minimum 12 characters"
              className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-400 focus:outline-none"
            />
            {newMasterPassword && (
              <div className="flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${strengthColors[masterPasswordStrength]}`}
                    style={{ width: `${(masterPasswordStrength / 5) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-slate-400">
                  {strengthLabels[masterPasswordStrength]}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-400">
              Confirm New Master Password
            </label>
            <input
              type="password"
              value={confirmMasterPassword}
              onChange={(e) => setConfirmMasterPassword(e.target.value)}
              required
              className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 focus:border-sky-400 focus:outline-none"
            />
          </div>

          <div className="flex gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 shrink-0"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>
              Changing your master password will re-encrypt all credentials with
              a new key. This operation may take a moment depending on how many
              credentials you have.
            </span>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isChangingMasterPassword || isLocked}
              className="rounded-lg bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:opacity-50"
            >
              {isChangingMasterPassword
                ? "Updating..."
                : "Change Master Password"}
            </button>
          </div>
        </form>
      </AccordionSection>

      {/* Security Info Accordion */}
      <AccordionSection
        id="info"
        title="Security Information"
        isOpen={openSection === "info"}
        onToggle={() => toggleSection("info")}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-600">
              Encryption
            </span>
            <span className="font-mono text-sm text-slate-300">
              AES-256-GCM (client-side)
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-600">
              Key Derivation
            </span>
            <span className="font-mono text-sm text-slate-300">
              Scrypt (N=2<sup>17</sup>, r=8, p=1)
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-600">
              Verification
            </span>
            <span className="font-mono text-sm text-slate-300">
              SHA-256 of derived key
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-600">
              Vault Status
            </span>
            <span
              className={`font-mono text-sm ${isLocked ? "text-red-400" : "text-green-400"}`}
            >
              {isLocked ? "Locked" : "Unlocked"}
            </span>
          </div>
        </div>
      </AccordionSection>
    </div>
  );
}
