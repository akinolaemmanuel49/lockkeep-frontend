import { useState } from "react";
import { useVault } from "~/providers/vault";
import { useToast } from "~/providers/toast";
import CredentialCard from "~/components/CredentialCard";
import CredentialModal from "~/components/CredentialModal";
import UnlockModal from "~/components/UnlockModal";
import type { Credential } from "~/types";
import { requireAuth } from "~/lib/auth-guard";
import type { Route } from "./+types/dashboard";

export const clientLoader = () => {
  return requireAuth();
};

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Dashboard - LockKeep" },
    {
      name: "description",
      content:
        "Manage your encrypted credentials. Search, add, and organize your passwords securely.",
    },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export default function Dashboard() {
  const {
    isLocked,
    credentials,
    isLoading,
    addCredential,
    updateCredential,
    deleteCredential,
    getPassword,
  } = useVault();
  const { addToast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(
    null,
  );
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const filtered = searchQuery.trim()
    ? credentials.filter(
      (c) =>
        c.organization.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.siteUrl.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.identifier.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    : credentials;

  const requestUnlock = (action: () => void) => {
    if (!isLocked) {
      action();
      return;
    }
    setPendingAction(() => action);
    setIsUnlockModalOpen(true);
  };

  const handleUnlockSuccess = () => {
    setIsUnlockModalOpen(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const handleAddClick = () => {
    setEditingCredential(null);
    requestUnlock(() => setIsAddModalOpen(true));
  };

  const handleEdit = (cred: Credential) => {
    setEditingCredential(cred);
    requestUnlock(() => setIsAddModalOpen(true));
  };

  const handleSave = async (data: {
    organization: string;
    siteUrl: string;
    identifier: string;
    password: string;
    notes: string;
  }) => {
    try {
      if (editingCredential) {
        await updateCredential(editingCredential.id, data);
        addToast("Credential updated", "success");
      } else {
        await addCredential(data);
        addToast("Credential saved", "success");
      }
      setIsAddModalOpen(false);
      setEditingCredential(null);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to save", "error");
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteCredential(deleteConfirmId);
      addToast("Credential deleted", "success");
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : "Failed to delete",
        "error",
      );
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const handleRevealPassword = (
    credentialId: string,
    onReveal: (password: string) => void,
  ) => {
    requestUnlock(async () => {
      try {
        const password = await getPassword(credentialId);
        onReveal(password);
      } catch (err) {
        addToast(
          err instanceof Error ? err.message : "Failed to get password",
          "error",
        );
      }
    });
  };

  const handleCopyPassword = (credentialId: string) => {
    requestUnlock(async () => {
      try {
        const password = await getPassword(credentialId);
        await navigator.clipboard.writeText(password);
        addToast("Password copied", "success");
      } catch (err) {
        addToast(
          err instanceof Error ? err.message : "Failed to copy password",
          "error",
        );
      }
    });
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[280px]">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#475569"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-3 top-1/2 -translate-y-1/2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by organization, site, or identifier..."
            className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-400 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <button
          onClick={handleAddClick}
          className="flex items-center gap-2 rounded-lg bg-sky-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-300"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Credential
        </button>
      </div>

      {/* Content */}
      {isLoading && credentials.length === 0 ? (
        <div className="flex items-center justify-center gap-3 py-20 text-slate-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400" />
          <span>Loading credentials...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#334155"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <p className="mt-4 text-lg font-semibold text-slate-600">
            {searchQuery ? "No matching credentials" : "No credentials yet"}
          </p>
          <p className="mt-1 text-sm text-slate-700">
            {searchQuery
              ? "Try adjusting your search"
              : "Click Add Credential to store your first password"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((cred) => (
            <CredentialCard
              key={cred.id}
              credential={cred}
              onRevealPassword={(onReveal) =>
                handleRevealPassword(cred.id, onReveal)
              }
              onCopyPassword={() => handleCopyPassword(cred.id)}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h3 className="mb-2 text-lg font-semibold text-slate-100">
              Delete Credential?
            </h3>
            <p className="mb-6 text-sm text-slate-400">
              This action cannot be undone. The credential will be permanently
              removed.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <UnlockModal
        isOpen={isUnlockModalOpen}
        onUnlock={handleUnlockSuccess}
        onCancel={() => {
          setIsUnlockModalOpen(false);
          setPendingAction(null);
        }}
      />

      <CredentialModal
        isOpen={isAddModalOpen}
        credential={editingCredential}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingCredential(null);
        }}
        onSave={handleSave}
      />
    </div>
  );
}
