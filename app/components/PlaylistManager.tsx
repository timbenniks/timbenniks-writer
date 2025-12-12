"use client";

import { useState } from "react";
import clsx from "clsx";
import type { Playlist } from "../types/video";
import { INPUT_CLASSES } from "../utils/constants";

interface PlaylistManagerProps {
  playlists: Playlist[];
  onAdd: (playlist: Playlist) => Promise<boolean>;
  onUpdate: (index: number, playlist: Playlist) => Promise<boolean>;
  onRemove: (index: number) => Promise<boolean>;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

export default function PlaylistManager({
  playlists,
  onAdd,
  onUpdate,
  onRemove,
  isLoading,
  isSaving,
  error,
}: PlaylistManagerProps) {
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newPlaylist, setNewPlaylist] = useState<Playlist>({
    id: "",
    name: "",
    folder: "",
    enabled: true,
  });
  const [editPlaylist, setEditPlaylist] = useState<Playlist | null>(null);

  const handleAddNew = async () => {
    if (!newPlaylist.id || !newPlaylist.name || !newPlaylist.folder) return;

    const success = await onAdd(newPlaylist);
    if (success) {
      setNewPlaylist({ id: "", name: "", folder: "", enabled: true });
      setIsAddingNew(false);
    }
  };

  const handleUpdate = async () => {
    if (editingIndex === null || !editPlaylist) return;

    const success = await onUpdate(editingIndex, editPlaylist);
    if (success) {
      setEditingIndex(null);
      setEditPlaylist(null);
    }
  };

  const handleRemove = async (index: number) => {
    if (confirm(`Are you sure you want to remove "${playlists[index].name}"?`)) {
      await onRemove(index);
    }
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditPlaylist({ ...playlists[index] });
    setIsAddingNew(false);
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditPlaylist(null);
  };

  if (isLoading) {
    return (
      <div className="p-4 bg-gray-50 rounded-md text-sm text-gray-600">
        Loading playlists...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Playlists table */}
      {playlists.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Folder
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Playlist ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Enabled
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {playlists.map((playlist, index) =>
                editingIndex === index && editPlaylist ? (
                  <tr key={index} className="bg-blue-50">
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={editPlaylist.name}
                        onChange={(e) =>
                          setEditPlaylist({ ...editPlaylist, name: e.target.value })
                        }
                        className={`${INPUT_CLASSES} text-sm`}
                        placeholder="Display name"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={editPlaylist.folder}
                        onChange={(e) =>
                          setEditPlaylist({ ...editPlaylist, folder: e.target.value })
                        }
                        className={`${INPUT_CLASSES} text-sm`}
                        placeholder="folder-name"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={editPlaylist.id}
                        onChange={(e) =>
                          setEditPlaylist({ ...editPlaylist, id: e.target.value })
                        }
                        className={`${INPUT_CLASSES} text-sm font-mono`}
                        placeholder="YouTube playlist ID"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={editPlaylist.enabled}
                        onChange={(e) =>
                          setEditPlaylist({ ...editPlaylist, enabled: e.target.checked })
                        }
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={handleUpdate}
                          disabled={isSaving}
                          className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          {isSaving ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={cancelEditing}
                          disabled={isSaving}
                          className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {playlist.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                      {playlist.folder}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono truncate max-w-xs">
                      {playlist.id}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          "inline-flex px-2 py-0.5 text-xs font-medium rounded",
                          playlist.enabled
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                        )}
                      >
                        {playlist.enabled ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => startEditing(index)}
                          className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleRemove(index)}
                          className="px-3 py-1 text-xs font-medium text-red-600 bg-red-50 rounded hover:bg-red-100"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {playlists.length === 0 && !isAddingNew && (
        <div className="p-6 bg-gray-50 rounded-lg text-center">
          <p className="text-sm text-gray-600 mb-4">
            No playlists configured. Add your first playlist to start importing videos.
          </p>
        </div>
      )}

      {/* Add new playlist form */}
      {isAddingNew && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-4">
          <h4 className="text-sm font-medium text-blue-900">Add New Playlist</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={newPlaylist.name}
                onChange={(e) =>
                  setNewPlaylist({ ...newPlaylist, name: e.target.value })
                }
                className={INPUT_CLASSES}
                placeholder="e.g., Contentstack"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Folder Name
              </label>
              <input
                type="text"
                value={newPlaylist.folder}
                onChange={(e) =>
                  setNewPlaylist({
                    ...newPlaylist,
                    folder: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                  })
                }
                className={INPUT_CLASSES}
                placeholder="e.g., contentstack"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                YouTube Playlist ID
              </label>
              <input
                type="text"
                value={newPlaylist.id}
                onChange={(e) =>
                  setNewPlaylist({ ...newPlaylist, id: e.target.value })
                }
                className={`${INPUT_CLASSES} font-mono`}
                placeholder="e.g., PLO9M7FOXF_QvVXYMJGY9eDnxPya9yzQhi"
              />
              <p className="text-xs text-gray-500 mt-1">
                Find this in the YouTube playlist URL after &quot;list=&quot;
              </p>
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="new-playlist-enabled"
                checked={newPlaylist.enabled}
                onChange={(e) =>
                  setNewPlaylist({ ...newPlaylist, enabled: e.target.checked })
                }
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="new-playlist-enabled" className="text-sm text-gray-700">
                Enabled (show in import dialog)
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setIsAddingNew(false);
                setNewPlaylist({ id: "", name: "", folder: "", enabled: true });
              }}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAddNew}
              disabled={isSaving || !newPlaylist.id || !newPlaylist.name || !newPlaylist.folder}
              className={clsx(
                "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                isSaving || !newPlaylist.id || !newPlaylist.name || !newPlaylist.folder
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}
            >
              {isSaving ? "Saving..." : "Add Playlist"}
            </button>
          </div>
        </div>
      )}

      {/* Add button */}
      {!isAddingNew && editingIndex === null && (
        <button
          onClick={() => setIsAddingNew(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Playlist
        </button>
      )}

      {/* Info text */}
      <p className="text-xs text-gray-500">
        Changes are saved to <code className="bg-gray-100 px-1 rounded">playlists.json</code> in your repository root.
      </p>
    </div>
  );
}

