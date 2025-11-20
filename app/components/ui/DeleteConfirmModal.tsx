import Modal from "./Modal";
import { BUTTON_SECONDARY_CLASSES, BUTTON_DANGER_CLASSES } from "../../utils/constants";

interface DeleteConfirmModalProps {
  isOpen: boolean;
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting?: boolean;
}

export default function DeleteConfirmModal({
  isOpen,
  title,
  onConfirm,
  onCancel,
  isDeleting = false,
}: DeleteConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} ariaLabel="Delete article confirmation">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete Article</h2>
        <p className="text-sm text-gray-600 mb-6">
          Are you sure you want to delete <strong>{title}</strong>? This
          action cannot be undone and will remove the file from GitHub.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className={`${BUTTON_SECONDARY_CLASSES} disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className={BUTTON_DANGER_CLASSES}
            aria-disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

