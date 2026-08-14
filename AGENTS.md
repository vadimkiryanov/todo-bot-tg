# Руководство по архитектуре Go-проектов

> На основе эталонного проекта `golang-arch` (Олег Козырев, 2026).
> Цель — дать AI-агенту исчерпывающий свод правил и паттернов для построения Go-проектов
> с чистой архитектурой, Rich Domain Model, CQRS и Anti-Corruption Layer.

---

## 1. Философия проекта

### 1.1 Главные принципы

| Принцип | Суть |
|----------|------|
| **Бизнес-логика в домене** | Все проверки и правила живут в методах доменных объектов (Spaceship, Hull, Engine…). Сервисы — только оркестраторы. |
| **Интерфейсы на стороне потребителя** | Go-идиома: интерфейс определяется там, где он используется (handler определяет Service, service определяет Repository). |
| **Принимаем интерфейсы, возвращаем конкретные типы** | Конструкторы `New*()` возвращают указатели на приватные структуры. Компилятор проверяет реализацию интерфейсов неявно. |
| **Никаких DI-контейнеров** | Все зависимости собираются вручную в `cmd/api/main.go`. Чисто, прозрачно, без магии. |
| **Никаких внешних фреймворков** | Только стандартная библиотека Go + `stretchr/testify` для тестов. Никаких ORM, роутеров, DI-библиотек. |
| **Богатая доменная модель** | Value Objects с валидацией и поведением, агрегаты с инкапсулированной бизнес-логикой, сущности с ID. |

### 1.2 Ключевые Go-идиомы

```go
// 1. Интерфейс определяется потребителем — НЕ в пакете реализации
// Плохо: repository/part/interface.go — интерфейс в пакете реализации
// Хорошо: service/assembly/service.go — интерфейс в пакете, который его использует
type PartRepository interface {
    GetByID(id int64) (model.Part, error)
    Save(part model.Part) error
}

// 2. Приватная структура, публичный конструктор
type handler struct {        // НЕ экспортируется
    service Service
}
func NewHandler(service Service) *handler {  // Экспортируется
    return &handler{service: service}
}

// 3. Конструктор возвращает конкретный тип — вызывающий код видит реальные методы
func NewRepository() *repository { ... }  // *repository, не интерфейс
```

---

## 2. Структура директорий

```
project-root/
├── cmd/
│   └── api/
│       └── main.go              # Точка входа, ручной DI
├── internal/                    # Весь код приложения (не импортируется снаружи)
│   ├── errors/
│   │   └── errors.go            # Все доменные ошибки (sentinel errors)
│   ├── model/                   # Доменная модель
│   │   ├── <агрегат>.go         # Агрегат (Spaceship, Part)
│   │   ├── <сущность>.go        # Сущность с ID (Hull, Engine, Shield…)
│   │   ├── <value_object>.go    # Value Object (HullStrength, Frequency…)
│   │   ├── supplier/            # Модели из внешнего контекста
│   │   │   └── price.go
│   │   ├── query/               # Read Models (CQRS)
│   │   │   └── spaceship.go
│   │   └── tests/               # Юнит-тесты доменной модели
│   │       └── *_test.go
│   ├── service/                 # Сервисный слой (оркестрация)
│   │   ├── <domain>/
│   │   │   ├── service.go       # Сервис + интерфейсы репозиториев
│   │   │   ├── service_test.go  # Юнит-тесты с ручными моками
│   │   │   └── dto/             # DTO сервисного слоя (если нужно)
│   ├── repository/              # Слой доступа к данным
│   │   ├── <domain>/
│   │   │   ├── repository.go         # Write Repository
│   │   │   ├── read_repository.go    # Read Repository (CQRS, опционально)
│   │   │   └── entity/               # Persistence-модели (Record)
│   │   │       ├── record.go
│   │   │       └── converter.go      # Record ↔ Domain конвертеры
│   ├── handler/                 # Транспортный слой (HTTP)
│   │   ├── router.go            # Регистрация маршрутов + интерфейсы handler'ов
│   │   ├── <domain>/
│   │   │   ├── handler.go       # HTTP-обработчики
│   │   │   └── dto/             # Request/Response DTO
│   │   │       ├── request.go
│   │   │       ├── response.go
│   │   │       └── converter.go # Domain ↔ DTO конвертеры
│   ├── integration/             # Внешние интеграции (ACL)
│   │   └── <external_system>/
│   │       ├── client.go        # HTTP/gRPC клиент (приватный)
│   │       ├── models.go        # Модели внешней системы (приватные)
│   │       └── adapter.go       # Адаптер: внешние модели → наши модели
│   └── tests/
│       └── e2e_test.go          # E2E-тесты (полный цикл через HTTP)
├── data/
│   └── inventory.csv            # Начальные данные
├── docs/                        # Документация
├── Taskfile.yaml                # Задачи: format, lint, tests, e2e_tests
├── .golangci.yml                # Конфигурация линтера
├── go.mod
└── go.sum
```

**Категорически запрещено:**
- Пакеты `utils/`, `helpers/`, `common/` — мусорные корзины. У каждого кода своё место.
- Циклические зависимости между пакетами. `model/` — лист, не зависит ни от кого.

---

## 3. Доменная модель (`internal/model/`)

### 3.1 Иерархия доменных объектов

```
Агрегат (Aggregate)
  ├── Сущность (Entity)         — имеет ID, может изменяться
  ├── Value Object              — НЕ имеет ID, иммутабелен, сравнивается по значению
  └── Перечисление (Enum)       — строковая константа с валидацией
```

### 3.2 Агрегат (Aggregate)

Агрегат — корень кластера объектов, с которыми работают внешние потребители. Содержит бизнес-методы, инкапсулирует инварианты.

**Правила:**
- Конструктор всегда валидирует обязательные поля
- Методы инкапсулируют бизнес-правила и возвращают `error`
- Статусы — строковые константы
- Обязательные поля — не указатели, опциональные — указатели

```go
// Spaceship — агрегат
type Spaceship struct {
    ID     int64
    Name   string
    Status SpaceshipStatus

    Hull     Hull      // обязательное — не указатель
    Engine   *Engine   // опциональное — указатель
    Shield   *Shield
    Weapon   *Weapon
    FuelTank *FuelTank

    FinalPrice int
    CreatedAt  time.Time
}

// Конструктор: гарантирует валидное состояние
func NewSpaceship(name string, hull Hull) (Spaceship, error) {
    if name == "" {
        return Spaceship{}, errs.ErrInvalidName
    }
    return Spaceship{
        Name:   name,
        Status: StatusInAssembly,
        Hull:   hull,
    }, nil
}

// Бизнес-метод: все проверки внутри агрегата
func (s *Spaceship) InstallEngine(engine *Engine) error {
    if s.Status != StatusInAssembly {
        return errs.ErrInvalidStatus
    }
    if s.Engine != nil {
        return errs.ErrComponentAlreadyInstalled
    }
    if !s.Hull.CanSupport(engine.Class) {
        return errs.ErrHullTooWeak
    }
    if s.FuelTank != nil && !engine.RequiresFuelType(s.FuelTank.Type) {
        return errs.ErrIncompatibleFuel
    }
    s.Engine = engine
    return nil
}
```

### 3.3 Сущность (Entity)

Имеет ID (`PartID`). Создаётся из Part через фабричный метод.

```go
// Engine — сущность (имеет PartID)
type Engine struct {
    PartID    int64
    Class     EngineClass
    FuelType  FuelType
}

// Фабричный метод: валидирует тип детали, конвертирует опциональные поля
func NewEngineFromPart(part Part) (*Engine, error) {
    if err := part.ValidateType(PartTypeEngine); err != nil {
        return nil, err
    }
    if part.EngineClass == nil || part.FuelType == nil {
        return nil, errs.ErrInvalidPartID
    }
    return &Engine{
        PartID:   part.ID,
        Class:    *part.EngineClass,
        FuelType: *part.FuelType,
    }, nil
}
```

### 3.4 Value Object

Иммутабельный, без ID, с валидацией в конструкторе и бизнес-поведением.

**Правила:**
- Базовый тип — `string` или `int`
- Константы для допустимых значений
- Конструктор с валидацией `New*`
- Методы бизнес-логики (если есть)
- Никаких сеттеров

```go
// EngineClass — Value Object
type EngineClass string

const (
    EngineClassA EngineClass = "A"
    EngineClassB EngineClass = "B"
    EngineClassC EngineClass = "C"
)

var validEngineClasses = map[EngineClass]bool{
    EngineClassA: true,
    EngineClassB: true,
    EngineClassC: true,
}

func NewEngineClass(v string) (EngineClass, error) {
    ec := EngineClass(v)
    if !validEngineClasses[ec] {
        return "", errs.ErrInvalidEngineClass
    }
    return ec, nil
}

// Бизнес-логика: класс A требует прочность 100, B — 50, C — 0
func (ec EngineClass) RequiredHullStrength() int {
    switch ec {
    case EngineClassA:
        return 100
    case EngineClassB:
        return 50
    default:
        return 0
    }
}
```

### 3.5 Часть (Part) — как инвентарный агрегат

```go
type Part struct {
    ID       int64
    Name     string
    Type     PartType
    Quantity int
    Reserved int
    Weight   float64
    // Опциональные характеристики (зависят от PartType)
    HullStrength    *HullStrength
    EngineClass     *EngineClass
    EngineType      *FuelType
    ShieldFrequency *Frequency
    WeaponFrequency *Frequency
    FuelType        *FuelType
}

// Резервирование детали для сборки
func (p *Part) Reserve(qty int) error {
    if p.Available() < qty {
        return errs.ErrNotEnoughParts
    }
    p.Reserved += qty
    return nil
}

// Снятие резерва (отмена сборки)
func (p *Part) Release(qty int) {
    p.Reserved -= qty
}

// Списание зарезервированного (завершение сборки)
func (p *Part) WithdrawReserved(qty int) error {
    if p.Reserved < qty {
        return errs.ErrNotEnoughParts
    }
    p.Quantity -= qty
    p.Reserved -= qty
    return nil
}

// Доступно для новых резервов
func (p Part) Available() int {
    return p.Quantity - p.Reserved
}
```

---

## 4. Сервисный слой (`internal/service/`)

### 4.1 Правила

- **Тонкая оркестрация**: вся бизнес-логика в доменных объектах.
- Каждый сервис имеет свой пакет.
- Интерфейсы репозиториев определяются прямо в файле сервиса (потребителем).
- Приватная структура + публичный конструктор.
- `sync.Mutex` для атомарности операций над несколькими агрегатами.

### 4.2 Шаблон сервиса

```go
package assembly

// Интерфейсы определяются потребителем — прямо здесь
type PartRepository interface {
    GetByID(id int64) (model.Part, error)
    Save(part model.Part) error
}

type SpaceshipRepository interface {
    Create(ship model.Spaceship) model.Spaceship
    GetByID(id int64) (model.Spaceship, error)
    GetAll() []model.Spaceship
    Save(ship model.Spaceship) error
}

// "Port" — интерфейс для внешних интеграций (ACL)
type PricePort interface {
    GetPrices(ctx context.Context, partTypes []model.PartType) ([]supplier.PartPrice, error)
}

type Service struct {
    mu        sync.Mutex  // для атомарности операций
    partRepo  PartRepository
    shipRepo  SpaceshipRepository
    pricePort PricePort
}

func NewService(
    partRepo PartRepository,
    shipRepo SpaceshipRepository,
    pricePort PricePort,
) *Service {
    return &Service{
        partRepo:  partRepo,
        shipRepo:  shipRepo,
        pricePort: pricePort,
    }
}

// Типичный метод: загрузить → делегировать домену → сохранить
func (s *Service) StartAssembly(name string, hullPartID int64) (int64, error) {
    s.mu.Lock()
    defer s.mu.Unlock()

    // 1. Загрузить данные
    part, err := s.partRepo.GetByID(hullPartID)
    if err != nil {
        return 0, err
    }

    // 2. Доменная операция
    if err = part.Reserve(1); err != nil {
        return 0, err
    }
    hull, err := model.NewHullFromPart(part)
    if err != nil {
        return 0, err
    }

    // 3. Сохранить
    if err = s.partRepo.Save(part); err != nil {
        return 0, err
    }

    ship, err := model.NewSpaceship(name, hull)
    if err != nil {
        return 0, err
    }

    return s.shipRepo.Create(ship).ID, nil
}
```

### 4.3 Обобщённый метод для устранения дублирования

```go
// Приватный метод с функциями-аргументами
func (s *Service) installComponent(
    shipID, componentID int64,
    createComponent func(part model.Part) error,
    installOnShip func(ship *model.Spaceship) error,
) error { ... }

// Публичный метод — минимальная обёртка
func (s *Service) InstallEngine(shipID, engineID int64) error {
    s.mu.Lock()
    defer s.mu.Unlock()

    var engine *model.Engine
    return s.installComponent(shipID, engineID,
        func(part model.Part) error {
            var err error
            engine, err = model.NewEngineFromPart(part)
            return err
        },
        func(ship *model.Spaceship) error {
            return ship.InstallEngine(engine)
        },
    )
}
```

---

## 5. Репозитории (`internal/repository/`)

### 5.1 Правила

- In-memory реализация. Для реальной БД — подставить реализацию того же интерфейса.
- **Entity Records**: persistence-модели (`*Record`) отделены от доменных моделей.
- **Конвертеры**: `ToRecord` / `FromRecord` изолируют домен от формата хранения.
- `sync.RWMutex` для конкурентного доступа.
- Приватная структура, публичный конструктор — возвращает `*repository`, не интерфейс.

### 5.2 Write Repository

```go
// repository — приватная структура
type repository struct {
    mu      sync.RWMutex
    storage map[int64]entity.SpaceshipRecord
    nextID  int64
}

func NewRepository() *repository {
    return &repository{
        storage: make(map[int64]entity.SpaceshipRecord),
        nextID:  1,
    }
}

func (r *repository) Create(ship model.Spaceship) model.Spaceship {
    r.mu.Lock()
    defer r.mu.Unlock()

    ship.ID = r.nextID
    r.storage[r.nextID] = entity.ToSpaceshipRecord(ship)
    r.nextID++
    return ship  // возвращаем с присвоенным ID
}

func (r *repository) GetByID(id int64) (model.Spaceship, error) {
    r.mu.RLock()
    defer r.mu.RUnlock()

    rec, exists := r.storage[id]
    if !exists {
        return model.Spaceship{}, errs.ErrNotFound
    }
    return entity.ToSpaceship(rec), nil
}
```

### 5.3 Entity Records — изоляция от домена

```go
// entity/record.go — ТОЛЬКО базовые типы, никаких Value Objects
type SpaceshipRecord struct {
    ID         int64
    Name       string
    Status     string           // строкой, не SpaceshipStatus
    Hull       HullRecord
    Engine     *EngineRecord    // nil = не установлен
    Shield     *ShieldRecord
    Weapon     *WeaponRecord
    FuelTank   *FuelTankRecord
    FinalPrice int
    CreatedAt  time.Time
}

type HullRecord struct {
    PartID   int64
    Strength int              // int, не HullStrength
}

// entity/converter.go
func ToSpaceshipRecord(ship model.Spaceship) SpaceshipRecord { ... }
func ToSpaceship(rec SpaceshipRecord) model.Spaceship { ... }
```

### 5.4 Read Repository (CQRS-lite)

```go
type readRepository struct {
    writeRepo *repository  // ссылка на то же хранилище
}

func NewReadRepository(writeRepo *repository) *readRepository {
    return &readRepository{writeRepo: writeRepo}
}

// Читает напрямую из storage, возвращает Read Models
func (r *readRepository) ListSpaceships(status *string) ([]query.SpaceshipListItem, error) {
    r.writeRepo.mu.RLock()
    defer r.writeRepo.mu.RUnlock()

    items := make([]query.SpaceshipListItem, 0, len(r.writeRepo.storage))
    for _, rec := range r.writeRepo.storage {
        if status != nil && rec.Status != *status {
            continue
        }
        items = append(items, query.SpaceshipListItem{
            ID:                rec.ID,
            Name:              rec.Name,
            Status:            rec.Status,
            CompletionPercent: query.CalculateCompletionPercent(...),
        })
    }
    return items, nil
}
```

**Ключевое**: Read Repository использует то же хранилище, что и Write. Никакого дублирования данных. Для реальной БД — может делать прямой SQL-запрос в денормализованную таблицу.

---

## 6. Транспортный слой (`internal/handler/`)

### 6.1 Router (`router.go`)

```go
// Интерфейсы handler'ов определяются в router (потребителем)
type PartHandler interface {
    Get(w http.ResponseWriter, r *http.Request)
    Create(w http.ResponseWriter, r *http.Request)
    Withdraw(w http.ResponseWriter, r *http.Request)
}

func RegisterRoutes(mux *http.ServeMux, partH PartHandler, ...) {
    // Go 1.22+ паттерны: "METHOD /path"
    mux.HandleFunc("GET /parts", partH.Get)
    mux.HandleFunc("POST /parts", partH.Create)
    mux.HandleFunc("POST /parts/{id}/withdraw", partH.Withdraw)
}
```

### 6.2 Handler

```go
// Интерфейс сервиса определяется здесь (потребителем)
type Service interface {
    GetAll() ([]model.Part, error)
    Create(name, partType string, quantity int, weight float64) (model.Part, error)
    Withdraw(id int64, quantity int) error
}

type handler struct {
    service Service
}

func NewHandler(service Service) *handler {
    return &handler{service: service}
}

func (h *handler) Create(w http.ResponseWriter, r *http.Request) {
    // 1. Десериализация
    var input dto.CreatePartRequest
    if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
        http.Error(w, "некорректный JSON", http.StatusBadRequest)
        return
    }

    // 2. Структурная валидация (обязательные поля)
    if input.Name == "" {
        http.Error(w, "название обязательно", http.StatusBadRequest)
        return
    }

    // 3. Вызов сервиса
    part, err := h.service.Create(input.Name, input.Type, input.Quantity, input.Weight)
    if err != nil {
        // 4. Маппинг ошибок на HTTP-статусы
        switch {
        case errors.Is(err, errs.ErrInvalidPartType):
            http.Error(w, err.Error(), http.StatusBadRequest)
        case errors.Is(err, errs.ErrInvalidName):
            http.Error(w, err.Error(), http.StatusBadRequest)
        default:
            http.Error(w, err.Error(), http.StatusInternalServerError)
        }
        return
    }

    // 5. Сериализация через DTO
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(dto.ToPartResponse(part))
}
```

### 6.3 DTO

```go
// request.go — то, что приходит от клиента
type CreatePartRequest struct {
    Name     string  `json:"name"`
    Type     string  `json:"type"`
    Quantity int     `json:"quantity"`
    Weight   float64 `json:"weight"`
}

// response.go — то, что уходит клиенту
type PartResponse struct {
    ID       int64   `json:"id"`
    Name     string  `json:"name"`
    Type     string  `json:"type"`
    Quantity int     `json:"quantity"`
    Weight   float64 `json:"weight"`
}

// converter.go — Domain → DTO
func ToPartResponse(part model.Part) PartResponse {
    return PartResponse{
        ID:       part.ID,
        Name:     part.Name,
        Type:     string(part.Type),
        Quantity: part.Quantity,
        Weight:   part.Weight,
    }
}
```

---

## 7. Anti-Corruption Layer (`internal/integration/`)

### 7.1 Структура

```
Домен (model/supplier/price.go)        ← НАШИ модели
    ↑
    │ PricePort (интерфейс в сервисе)
    │
Adapter (galactic/adapter.go)           ← Переводчик форматов
    │
Client (galactic/client.go)             ← HTTP-запросы (приватный)
    │
Внешнее API (GalacticParts)             ← ИХ формат
```

### 7.2 Client — приватный, работает только с ИХ форматом

```go
// client.go — НЕ экспортируется
type client struct {
    baseURL    string
    httpClient *http.Client
}

func newClient(baseURL string) *client { ... }

// Работает только с ИХ моделями (приватными)
func (c *client) getPricing(ctx context.Context, vendorSKUs []string) (pricingResponse, error) { ... }
```

### 7.3 Models — приватные модели внешней системы

```go
// models.go — все структуры НЕ экспортируются
type pricingRequest struct {
    VendorSKUs []string `json:"vendor_skus"`
}

type pricingResponse struct {
    Items []priceItem `json:"items"`
}

type priceItem struct {
    VendorSKU       string `json:"vendor_sku"`
    BaseCostCredits int    `json:"base_cost_credits"`
    Available       bool   `json:"available"`
}
```

### 7.4 Adapter — публичный, конвертирует форматы

```go
// adapter.go — ЭКСПОРТИРУЕТСЯ
type Adapter struct {
    client *client
}

func NewAdapter(baseURL string) *Adapter {
    return &Adapter{client: newClient(baseURL)}
}

// Реализует PricePort из сервисного слоя
func (a *Adapter) GetPrices(ctx context.Context, partTypes []model.PartType) ([]supplier.PartPrice, error) {
    // 1. НАШИ типы → ИХ SKU
    vendorSKUs := make([]string, 0, len(partTypes))
    for _, pt := range partTypes {
        if sku, ok := partTypeToSKU[pt]; ok {
            vendorSKUs = append(vendorSKUs, sku)
        }
    }

    // 2. Вызов ИХ API
    resp, err := a.client.getPricing(ctx, vendorSKUs)
    if err != nil {
        return nil, err
    }

    // 3. ИХ ответ → НАШИ структуры
    prices := make([]supplier.PartPrice, 0, len(resp.Items))
    for _, item := range resp.Items {
        partType, ok := skuToPartType[item.VendorSKU]
        if !ok {
            continue
        }
        prices = append(prices, supplier.PartPrice{
            PartType: partType,
            Price:    item.BaseCostCredits * 100,  // конвертация валюты
        })
    }
    return prices, nil
}
```

**Ключевое:**
- Ни одна строка ИХ формата не выходит за пределы `integration/galactic/`.
- Сменятся условия API — изменится только Adapter. Сервис не тронут.
- Маппинги (`partTypeToSKU`, `skuToPartType`) — явные, не магические строки.

---

## 8. Обработка ошибок

### 8.1 Все ошибки в одном месте

```go
// internal/errors/errors.go
package errors

import "errors"

var (
    // Общие
    ErrNotFound       = errors.New("деталь не найдена")
    ErrNotEnoughParts = errors.New("недостаточно деталей")
    ErrInvalidStatus  = errors.New("некорректный статус корабля")

    // Value Object ошибки
    ErrInvalidHullStrength = errors.New("некорректная прочность корпуса")
    ErrInvalidEngineClass  = errors.New("некорректный класс двигателя")

    // Доменные ошибки
    ErrHullTooWeak               = errors.New("корпус слишком слабый для этого двигателя")
    ErrComponentAlreadyInstalled = errors.New("компонент уже установлен")
    ErrFrequencyConflict         = errors.New("щит и оружие имеют конфликтующие частоты")
    ErrIncompatibleFuel          = errors.New("тип топлива несовместим с двигателем")
)
```

### 8.2 Маппинг на HTTP-статусы в handler'ах

```go
if err != nil {
    switch {
    case errors.Is(err, errs.ErrNotFound):
        http.Error(w, "не найдено", http.StatusNotFound)
    case errors.Is(err, errs.ErrInvalidStatus):
        http.Error(w, err.Error(), http.StatusBadRequest)
    // ... ещё доменные ошибки
    default:
        http.Error(w, err.Error(), http.StatusInternalServerError)
    }
    return
}
```

### 8.3 Правила

- Только sentinel errors (`errors.New`), никаких кастомных типов ошибок без необходимости.
- Ошибки — на русском (предметная область), но для production — на английском.
- `errors.Is()` для сравнения, не `==`.
- Никогда не заворачивать доменные ошибки в `fmt.Errorf` с `%w` без необходимости — теряется возможность `errors.Is`.

---

## 9. CQRS-lite (Command Query Responsibility Segregation)

### 9.1 Идея

Разделение путей записи и чтения без Event Sourcing и отдельных БД:

| Путь | Модель | Репозиторий | Эндпоинты |
|------|--------|-------------|-----------|
| **Write** | Доменные агрегаты (Spaceship, Part) | `spaceship/repository.go` | `/assembly/*` |
| **Read** | Read Models (SpaceshipListItem, SpaceshipDetail) | `spaceship/read_repository.go` | `/spaceships/*` |

### 9.2 Read Model

```go
// model/query/spaceship.go
type SpaceshipListItem struct {
    ID                int64
    Name              string
    Status            string
    CompletionPercent int      // вычисляемое поле
}

type SpaceshipDetail struct {
    ID                int64
    Name              string
    Status            string
    CompletionPercent int
    FinalPrice        int
    CreatedAt         time.Time
    HullID            int64
    EngineID          *int64  // nil = не установлен
    ShieldID          *int64
    WeaponID          *int64
    FuelTankID        *int64
}

// Вычисление — в модели, не в репозитории
func CalculateCompletionPercent(hasHull, hasEngine, hasShield, hasWeapon, hasFuelTank bool) int {
    total := 5
    installed := 0
    if hasHull { installed++ }
    if hasEngine { installed++ }
    if hasShield { installed++ }
    if hasWeapon { installed++ }
    if hasFuelTank { installed++ }
    return installed * 100 / total
}
```

### 9.3 Read Handler — обращается к репозиторию напрямую

```go
// spaceship/handler.go
type QueryRepository interface {
    ListSpaceships(status *string) ([]query.SpaceshipListItem, error)
    GetSpaceshipDetail(id int64) (query.SpaceshipDetail, error)
}

// Read Path: handler → repository (без сервиса-посредника)
func (h *handler) List(w http.ResponseWriter, r *http.Request) {
    var status *string
    if s := r.URL.Query().Get("status"); s != "" {
        status = &s
    }
    items, err := h.repo.ListSpaceships(status)
    // ...
}
```

**Когда НЕ нужен сервисный слой:** когда операция — чистое чтение данных без бизнес-логики. Read Handler может обращаться к Read Repository напрямую.

---

## 10. Dependency Injection (ручной)

### 10.1 Точка входа (`cmd/api/main.go`)

```go
func main() {
    // 1. Репозитории
    partRepo := partRepo.NewRepository()
    spaceshipRepo := spaceshipRepo.NewRepository()

    // 2. Внешние адаптеры
    priceAdapter := galactic.NewAdapter("https://api.galacticparts.io")

    // 3. Сервисы
    partSvc := partService.NewService(partRepo)
    assemblySvc := assemblyService.NewService(partRepo, spaceshipRepo, priceAdapter)

    // 4. Read Repository
    spaceshipReadRepo := spaceshipRepo.NewReadRepository(spaceshipRepo)

    // 5. Handlers
    partH := part.NewHandler(partSvc)
    assemblyH := assemblyHandler.NewHandler(assemblySvc)
    spaceshipH := spaceshipHandler.NewHandler(spaceshipReadRepo)

    // 6. Загрузка начальных данных
    partRepo.LoadFromCSV("data/inventory.csv")

    // 7. HTTP-сервер
    mux := http.NewServeMux()
    handler.RegisterRoutes(mux, partH, assemblyH, spaceshipH)

    server := &http.Server{
        Addr:         ":8080",
        Handler:      mux,
        ReadTimeout:  10 * time.Second,
        WriteTimeout: 10 * time.Second,
        IdleTimeout:  60 * time.Second,
    }
    log.Fatal(server.ListenAndServe())
}
```

**Никаких DI-контейнеров, фреймворков, кодогенерации.** Всё явно, видно, кто от кого зависит. Для проекта любого размера — ручной DI достаточно хорош.

---

## 11. Тестирование

### 11.1 Три уровня тестов

| Уровень | Расположение | Что тестируем | Моки |
|---------|-------------|---------------|------|
| **Доменные юниты** | `model/tests/` | Бизнес-правила агрегатов, VO, сущностей | Нет |
| **Сервисные юниты** | `service/*/service_test.go` | Оркестрацию, обработку ошибок | Ручные моки (структуры) |
| **E2E** | `tests/e2e_test.go` | Полный HTTP-цикл | Заглушка внешнего API |

### 11.2 Доменные тесты — без моков

```go
func TestNewSpaceship_ValidName(t *testing.T) {
    hull, _ := model.NewHullFromPart(createTestPart(t, model.PartTypeHull, 100))
    ship, err := model.NewSpaceship("Звездный разрушитель", hull)
    require.NoError(t, err)
    require.Equal(t, "Звездный разрушитель", ship.Name)
    require.Equal(t, model.StatusInAssembly, ship.Status)
}
```

### 11.3 Сервисные тесты — ручные моки

```go
type mockPartRepo struct {
    parts map[int64]model.Part
}

func (m *mockPartRepo) GetByID(id int64) (model.Part, error) {
    part, exists := m.parts[id]
    if !exists {
        return model.Part{}, errs.ErrNotFound
    }
    return part, nil
}

// ... тесты используют mockPartRepo, mockShipRepo, mockPricePort
```

### 11.4 E2E тесты — полный цикл

```go
func setupTestServer() *httptest.Server {
    // Тот же код, что и в main.go, но с заглушкой вместо реального API
    partRepo := partRepo.NewRepository()
    shipRepo := spaceshipRepo.NewRepository()
    partSvc := partService.NewService(partRepo)
    assemblySvc := assemblyService.NewService(partRepo, shipRepo, &stubPricePort{})
    // ...
}

func TestAPI_CreatePart_Success(t *testing.T) {
    server := setupTestServer()
    defer server.Close()

    body := `{"name":"Корпус","type":"hull","quantity":5,"weight":100}`
    resp, _ := http.Post(server.URL+"/parts", "application/json", strings.NewReader(body))
    require.Equal(t, http.StatusCreated, resp.StatusCode)
}
```

**Принцип:** никакого Docker, никаких внешних зависимостей. Всё in-memory.

---

## 12. Работа с данными (data flow)

```
HTTP Request
    │
    ▼
handler/dto/request.go         ← десериализация JSON
    │
    ▼
handler/handler.go             ← структурная валидация, вызов сервиса
    │
    ▼
service/*/service.go           ← оркестрация (load → domain → save)
    │
    ├── model/*.go              ← бизнес-логика (агрегаты, VO, сущности)
    │
    ├── repository/*/entity/    ← конвертация Domain ↔ Record
    │       │
    │       ▼
    │   repository/*/           ← хранение (in-memory map)
    │
    └── integration/*/          ← внешние API (через Port)
    │
    ▼
handler/dto/response.go        ← сериализация Domain → JSON
    │
    ▼
HTTP Response
```

---

## 13. Инструментарий

### 13.1 Taskfile

```yaml
tasks:
  format:
    desc: "Форматирует весь проект gofumpt + gci"
    cmds:
      - gofumpt -extra -w .  # более строгий gofmt
      - gci write -s standard -s default -s "prefix(github.com/olezhek28/...)" .

  lint:
    desc: "Запускает golangci-lint"
    cmds:
      - golangci-lint run ./...

  tests:
    desc: "Юнит-тесты"
    cmds:
      - go test ./internal/... -v

  e2e_tests:
    desc: "E2E тесты"
    cmds:
      - go test ./internal/tests/... -v -run TestAPI
```

### 13.2 Линтер (ключевые правила)

```yaml
# Включены:
# - errcheck, staticcheck, govet, gocritic, revive, unused
# - gosec, depguard, bodyclose
# - errorlint, errname
# - forbidigo (запрещает fmt.Print*, time.Sleep, http.DefaultClient)
# - cyclop (макс. сложность 20)

# Форматтеры:
# - gofumpt (extra-rules)
# - gci (3 группы импортов: standard, default, project)
```

### 13.3 Сортировка импортов (gci)

```go
import (
    "context"        // группа 1: standard library
    "encoding/json"
    "net/http"

    "github.com/stretchr/testify/require"  // группа 2: external

    "github.com/olezhek28/golang-arch/internal/model"  // группа 3: project
)
```

---

## 14. Эволюционный путь (от простого к сложному)

| Этап | Что строится | Ключевые паттерны |
|------|-------------|-------------------|
| **Act 0** | CLI-утилита в одном файле | Чтение CSV, вывод статистики |
| **Act 1** | REST API | Трёхслойная архитектура: Handler → Service → Repository |
| **Act 2** | Изоляция логики | Интерфейсы, валидация, отделение бизнес-правил |
| **Act 3** | Сборка кораблей | Несколько сервисов, резервирование, mutex-атомарность |
| **Act 4** | Богатая доменная модель | Value Objects, агрегаты, правила совместимости |
| **Act 5** | Внешние интеграции | Anti-Corruption Layer, Adapter, Port |
| **Act 6** | CQRS-lite | Read/Write Path разделение, Read Models, прямой доступ handler→repo |

**Правило:** не начинай с Act 6. Каждый этап — ответ на конкретную потребность. Не усложняй заранее.

---

## 15. Чек-лист для AI-агента

При создании нового Go-проекта по этой архитектуре:

- [ ] `cmd/api/main.go`: ручной DI, без контейнеров
- [ ] `internal/errors/errors.go`: все sentinel-ошибки в одном месте
- [ ] `internal/model/`: агрегаты с бизнес-методами, Value Objects с валидацией, сущности с ID
- [ ] `internal/service/`: тонкие сервисы-оркестраторы, интерфейсы репозиториев на стороне потребителя
- [ ] `internal/repository/`: in-memory реализация, Entity Records отдельно от доменных моделей, конвертеры
- [ ] `internal/handler/`: handler с интерфейсом сервиса (определён потребителем), DTO для Request/Response
- [ ] `internal/handler/router.go`: интерфейсы handler'ов + регистрация маршрутов
- [ ] `internal/integration/`: внешние API изолированы за Adapter'ом, приватные client и models
- [ ] `internal/tests/e2e_test.go`: E2E тесты с `httptest.NewServer`, заглушки внешних API
- [ ] Конструкторы: принимают интерфейсы, возвращают конкретные приватные типы
- [ ] Никаких `utils/`, `helpers/`, `common/` пакетов
- [ ] Никаких DI-фреймворков, ORM, внешних роутеров
- [ ] `Taskfile.yaml`: format, lint, tests, e2e_tests
- [ ] `.golangci.yml`: строгий линтинг
- [ ] `*_test.go`: тесты на трёх уровнях (domain unit → service unit → e2e)

---

## 16. Антипаттерны (чего избегать)

| Антипаттерн | Почему плохо | Как надо |
|-------------|-------------|----------|
| **Anemic Domain Model** (структуры без методов) | Бизнес-логика расползается по сервисам | Методы на агрегатах: `ship.InstallEngine()`, `part.Reserve()` |
| **Интерфейсы в пакете реализации** | Нарушение Go-идиомы, лишние зависимости | Интерфейс там, где используется |
| **DI-контейнеры** | Скрывают граф зависимостей, магия | Ручной DI в `main.go` |
| **Пакеты utils/helpers** | Мусорная корзина, всё смешивается | Код идёт в конкретный доменный пакет |
| **DTO без конвертеров** | Домен протекает в API | Converter-функции: Domain ↔ DTO |
| **Бизнес-логика в handler'ах** | Дублирование, невозможно переиспользовать | Только структурная валидация, вызов сервиса |
| **Прямое использование внешних моделей** | Изменения внешнего API ломают весь код | ACL: Adapter конвертирует в наши модели |
| **Ошибки без контекста предметной области** | Непонятно, что случилось | `ErrHullTooWeak`, не `fmt.Errorf("hull strength too low: %d", s)` |
| **Преждевременное CQRS/Event Sourcing** | Сложность без необходимости | Начинай с простого, усложняй по мере потребности |

## 16. Обновление CHANGELOG.md
После реализации какой-то задачи - CHANGELOG.md
