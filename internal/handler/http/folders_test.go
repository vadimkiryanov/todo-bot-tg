package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"todo-bot-tg/internal/handler/http/dto"
)

// createFolder создаёт папку через API и возвращает её.
func createFolder(t *testing.T, router http.Handler, cookie *http.Cookie, topicID int64, parentID *int64, name string) dto.FolderResponse {
	t.Helper()
	body := fmt.Sprintf(`{"topic_id":%d,"name":%q}`, topicID, name)
	if parentID != nil {
		body = fmt.Sprintf(`{"topic_id":%d,"parent_folder_id":%d,"name":%q}`, topicID, *parentID, name)
	}
	rec := doJSON(t, router, http.MethodPost, "/api/v1/folders", body, cookie)
	require.Equal(t, http.StatusCreated, rec.Code, "тело: %s", rec.Body.String())
	var folder dto.FolderResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &folder))
	require.Positive(t, folder.ID)
	require.Equal(t, name, folder.Name)
	return folder
}

func listFolders(t *testing.T, router http.Handler, cookie *http.Cookie, path string) []dto.FolderResponse {
	t.Helper()
	rec := doJSON(t, router, http.MethodGet, path, "", cookie)
	require.Equal(t, http.StatusOK, rec.Code, "тело: %s", rec.Body.String())
	var folders []dto.FolderResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &folders))
	return folders
}

func TestFolders_CRUD(t *testing.T) {
	router := newTestRouter(t)
	cookie := registerUser(t, router, "folder_user", "password123")
	topic := createTopic(t, router, cookie, "Проект")

	// Создание корневой папки → 201
	folder := createFolder(t, router, cookie, topic.ID, nil, "Идеи")
	require.Nil(t, folder.ParentFolderID)

	// Создание подпапки → 201 с parent_folder_id
	sub := createFolder(t, router, cookie, topic.ID, &folder.ID, "Вложения")
	require.NotNil(t, sub.ParentFolderID)
	require.Equal(t, folder.ID, *sub.ParentFolderID)

	// Список корневых папок → 1 (подпапка не попадает)
	rootFolders := listFolders(t, router, cookie, fmt.Sprintf("/api/v1/folders?topic_id=%d", topic.ID))
	require.Len(t, rootFolders, 1)
	require.Equal(t, folder.ID, rootFolders[0].ID)

	// Список подпапок parent_id=folder.ID → 1
	subFolders := listFolders(t, router, cookie,
		fmt.Sprintf("/api/v1/folders?topic_id=%d&parent_id=%d", topic.ID, folder.ID))
	require.Len(t, subFolders, 1)
	require.Equal(t, sub.ID, subFolders[0].ID)

	// all=true → все папки (2)
	all := listFolders(t, router, cookie, fmt.Sprintf("/api/v1/folders?topic_id=%d&all=true", topic.ID))
	require.Len(t, all, 2)

	// Переименование → 200 с новым именем
	rec := doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/folders/%d", folder.ID), `{"name":"Мысли"}`, cookie)
	require.Equal(t, http.StatusOK, rec.Code, "тело: %s", rec.Body.String())
	var renamed dto.FolderResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &renamed))
	require.Equal(t, "Мысли", renamed.Name)

	// Удаление корневой папки → 204, каскад: подпапка тоже удалена
	rec = doJSON(t, router, http.MethodDelete,
		fmt.Sprintf("/api/v1/folders/%d", folder.ID), "", cookie)
	require.Equal(t, http.StatusNoContent, rec.Code)

	rootFolders = listFolders(t, router, cookie, fmt.Sprintf("/api/v1/folders?topic_id=%d", topic.ID))
	require.Empty(t, rootFolders)
	all = listFolders(t, router, cookie, fmt.Sprintf("/api/v1/folders?topic_id=%d&all=true", topic.ID))
	require.Empty(t, all)

	// Повторное удаление → 404
	rec = doJSON(t, router, http.MethodDelete,
		fmt.Sprintf("/api/v1/folders/%d", folder.ID), "", cookie)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestFolders_Errors(t *testing.T) {
	router := newTestRouter(t)
	cookie := registerUser(t, router, "folder_err", "password123")
	topic := createTopic(t, router, cookie, "Топик")
	folder := createFolder(t, router, cookie, topic.ID, nil, "Папка")

	// Без сессии → 401
	rec := doJSON(t, router, http.MethodGet, "/api/v1/folders", "")
	require.Equal(t, http.StatusUnauthorized, rec.Code)
	rec = doJSON(t, router, http.MethodPost, "/api/v1/folders", `{"topic_id":1,"name":"x"}`)
	require.Equal(t, http.StatusUnauthorized, rec.Code)

	// Пустое имя → 400
	rec = doJSON(t, router, http.MethodPost, "/api/v1/folders",
		fmt.Sprintf(`{"topic_id":%d,"name":""}`, topic.ID), cookie)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	// Пустое имя при переименовании → 400
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/folders/%d", folder.ID), `{"name":""}`, cookie)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	// Дубликат имени среди соседей → 409
	rec = doJSON(t, router, http.MethodPost, "/api/v1/folders",
		fmt.Sprintf(`{"topic_id":%d,"name":"Папка"}`, topic.ID), cookie)
	require.Equal(t, http.StatusConflict, rec.Code)

	// Несуществующая папка → 404
	rec = doJSON(t, router, http.MethodPatch, "/api/v1/folders/999", `{"name":"X"}`, cookie)
	require.Equal(t, http.StatusNotFound, rec.Code)
	rec = doJSON(t, router, http.MethodDelete, "/api/v1/folders/999", "", cookie)
	require.Equal(t, http.StatusNotFound, rec.Code)

	// Кривой topic_id в query → 400
	rec = doJSON(t, router, http.MethodGet, "/api/v1/folders?topic_id=abc", "", cookie)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestFolders_IsolationBetweenUsers(t *testing.T) {
	router := newTestRouter(t)
	alice := registerUser(t, router, "alice_f", "password123")
	bob := registerUser(t, router, "bob_f", "password123")

	topic := createTopic(t, router, alice, "Алисин")
	folder := createFolder(t, router, alice, topic.ID, nil, "Секрет")

	// Боб не видит папки Алисы
	folders := listFolders(t, router, bob, fmt.Sprintf("/api/v1/folders?topic_id=%d", topic.ID))
	require.Empty(t, folders)

	// Боб не может переименовать/удалить чужую папку → 404
	rec := doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/folders/%d", folder.ID), `{"name":"X"}`, bob)
	require.Equal(t, http.StatusNotFound, rec.Code)
	rec = doJSON(t, router, http.MethodDelete,
		fmt.Sprintf("/api/v1/folders/%d", folder.ID), "", bob)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestFolders_CascadeDeleteNotes(t *testing.T) {
	router := newTestRouter(t)
	cookie := registerUser(t, router, "cascade", "password123")
	topic := createTopic(t, router, cookie, "Топик")

	root := createFolder(t, router, cookie, topic.ID, nil, "Корень")
	sub := createFolder(t, router, cookie, topic.ID, &root.ID, "Подпапка")

	// Заметки: в корне, в подпапке и вне папок
	rootNote := createNoteInFolder(t, router, cookie, topic.ID, root.ID, "в корне")
	subNote := createNoteInFolder(t, router, cookie, topic.ID, sub.ID, "в подпапке")
	plainNote := createNote(t, router, cookie, topic.ID, "без папки")

	// Удаление корня → каскад: заметки корня и подпапки исчезают, "без папки" остаётся
	rec := doJSON(t, router, http.MethodDelete,
		fmt.Sprintf("/api/v1/folders/%d", root.ID), "", cookie)
	require.Equal(t, http.StatusNoContent, rec.Code)

	notes := listNotesOf(t, router, cookie, topic.ID)
	require.Len(t, notes, 1)
	require.Equal(t, plainNote.ID, notes[0].ID)

	// rootNote и subNote больше не существуют → 404
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/notes/%d", rootNote.ID), `{"done":true}`, cookie)
	require.Equal(t, http.StatusNotFound, rec.Code)
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/notes/%d", subNote.ID), `{"done":true}`, cookie)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestNotes_MoveBetweenFoldersAndTopics(t *testing.T) {
	router := newTestRouter(t)
	cookie := registerUser(t, router, "move_user", "password123")
	topicA := createTopic(t, router, cookie, "Топик А")
	topicB := createTopic(t, router, cookie, "Топик Б")

	folderA := createFolder(t, router, cookie, topicA.ID, nil, "Папка А")
	subA := createFolder(t, router, cookie, topicA.ID, &folderA.ID, "Подпапка А")
	folderB := createFolder(t, router, cookie, topicB.ID, nil, "Папка Б")

	note := createNote(t, router, cookie, topicA.ID, "Заметка")

	// В папку А → 200, folder_id заполнен
	rec := doJSON(t, router, http.MethodPost,
		fmt.Sprintf("/api/v1/notes/%d/move", note.ID),
		fmt.Sprintf(`{"topic_id":%d,"folder_id":%d}`, topicA.ID, folderA.ID), cookie)
	require.Equal(t, http.StatusOK, rec.Code, "тело: %s", rec.Body.String())
	var moved dto.NoteResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &moved))
	require.Equal(t, topicA.ID, moved.TopicID)
	require.NotNil(t, moved.FolderID)
	require.Equal(t, folderA.ID, *moved.FolderID)

	// Заметка видна в списке папки А, но не в подпапке А
	rec = doJSON(t, router, http.MethodGet,
		fmt.Sprintf("/api/v1/notes?topic_id=%d&folder_id=%d", topicA.ID, folderA.ID), "", cookie)
	var inFolder []dto.NoteResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &inFolder))
	require.Len(t, inFolder, 1)
	require.Equal(t, note.ID, inFolder[0].ID)

	rec = doJSON(t, router, http.MethodGet,
		fmt.Sprintf("/api/v1/notes?topic_id=%d&folder_id=%d", topicA.ID, subA.ID), "", cookie)
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &inFolder))
	require.Empty(t, inFolder, "в подпапке заметки быть не должно")

	// В подпапку А
	rec = doJSON(t, router, http.MethodPost,
		fmt.Sprintf("/api/v1/notes/%d/move", note.ID),
		fmt.Sprintf(`{"topic_id":%d,"folder_id":%d}`, topicA.ID, subA.ID), cookie)
	require.Equal(t, http.StatusOK, rec.Code)

	// В корень топика Б (folder_id null) → 200, folder_id=nil, topic_id=Б
	rec = doJSON(t, router, http.MethodPost,
		fmt.Sprintf("/api/v1/notes/%d/move", note.ID),
		fmt.Sprintf(`{"topic_id":%d,"folder_id":null}`, topicB.ID), cookie)
	require.Equal(t, http.StatusOK, rec.Code, "тело: %s", rec.Body.String())
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &moved))
	require.Equal(t, topicB.ID, moved.TopicID)
	require.Nil(t, moved.FolderID)

	// В папку другого топика → 404 (папка не принадлежит целевому топику)
	rec = doJSON(t, router, http.MethodPost,
		fmt.Sprintf("/api/v1/notes/%d/move", note.ID),
		fmt.Sprintf(`{"topic_id":%d,"folder_id":%d}`, topicB.ID, folderA.ID), cookie)
	require.Equal(t, http.StatusNotFound, rec.Code)

	// Чужую папку нельзя использовать (Боб) → 404
	bob := registerUser(t, router, "move_bob", "password123")
	rec = doJSON(t, router, http.MethodPost,
		fmt.Sprintf("/api/v1/notes/%d/move", note.ID),
		fmt.Sprintf(`{"topic_id":%d,"folder_id":%d}`, topicB.ID, folderB.ID), bob)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestTopics_Delete_CascadesFolders(t *testing.T) {
	router := newTestRouter(t)
	cookie := registerUser(t, router, "topic_cascade", "password123")
	topic := createTopic(t, router, cookie, "Топик")
	folder := createFolder(t, router, cookie, topic.ID, nil, "Папка")
	createNoteInFolder(t, router, cookie, topic.ID, folder.ID, "заметка в папке")

	// Удаление топика → 204; папки топика не остаются сиротами
	rec := doJSON(t, router, http.MethodDelete,
		fmt.Sprintf("/api/v1/topics/%d", topic.ID), "", cookie)
	require.Equal(t, http.StatusNoContent, rec.Code)

	folders := listFolders(t, router, cookie, fmt.Sprintf("/api/v1/folders?topic_id=%d&all=true", topic.ID))
	require.Empty(t, folders)

	// Папка удалённого топика недоступна → 404
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/folders/%d", folder.ID), `{"name":"X"}`, cookie)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

// --- helpers ---

// createNoteInFolder создаёт заметку в указанной папке через API.
func createNoteInFolder(t *testing.T, router http.Handler, cookie *http.Cookie, topicID, folderID int64, text string) dto.NoteResponse {
	t.Helper()
	rec := doJSON(t, router, http.MethodPost, "/api/v1/notes",
		fmt.Sprintf(`{"topic_id":%d,"folder_id":%d,"text":%q}`, topicID, folderID, text), cookie)
	require.Equal(t, http.StatusCreated, rec.Code, "тело: %s", rec.Body.String())
	var note dto.NoteResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &note))
	require.NotNil(t, note.FolderID)
	require.Equal(t, folderID, *note.FolderID)
	return note
}

// listNotesOf возвращает все неархивные заметки топика.
func listNotesOf(t *testing.T, router http.Handler, cookie *http.Cookie, topicID int64) []dto.NoteResponse {
	t.Helper()
	rec := doJSON(t, router, http.MethodGet,
		fmt.Sprintf("/api/v1/notes?topic_id=%d", topicID), "", cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	var notes []dto.NoteResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &notes))
	return notes
}
