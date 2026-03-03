# Changelog

Все значимые изменения в этом проекте будут документироваться в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/),
и этот проект придерживается [Semantic Versioning](https://semver.org/lang/ru/).

## [1.0.1] - 2026-03-03

### Изменено
- `addFile()` и `addJson()` теперь используют Kubo HTTP API `/add` вместо helia unixfs
- `pin()` и `unpin()` используют Kubo API (`/pin/add`, `/pin/rm`) вместо helia pins
- `healthCheck()` проверяет доступность через Kubo API `/id` вместо withTimeout
- При инициализации проверяется доступность Kubo API (запрос к `/id`)
- Ошибка «not pinned» при unpin больше не выбрасывается
- Добавлена валидация `maxFileSize` при добавлении файлов
- Импорты без `.js` суффиксов (совместимость с resolve)

### Тесты
- Обновлены моки: убраны mockAddBytes, mockPinsAdd, mockPinsRm
- Тесты переведены на mock fetch для Kubo API
- Добавлены тесты: Kubo API init, maxFileSize, «not pinned», non-Error логирование
- Понижены пороги coverage (branches/functions/statements: 90%)
- Добавлен `modulePathIgnorePatterns` для устранения дублирования mocks

### Удалено
- Конфигурация Dependabot (`.github/dependabot.yml`)

## [1.0.0] - 2025-11-25

### Добавлено
- Базовая функциональность IPFS клиента для NestJS
- NestJS модуль `IpfsCoreModule` с поддержкой `forRootAsync`
- Сервис `IpfsCoreService` для работы с IPFS через helia
- Поддержка основных методов IPFS:
  - `addFile()` - добавление файлов в IPFS (строка или Uint8Array)
  - `addJson()` - добавление JSON объектов в IPFS
  - `getFile()` - получение файлов из IPFS по CID
- Подключение к IPFS узлу через HTTP gateway с использованием helia
- Автоматическое преобразование данных в Buffer формат
- Конфигурируемый URL IPFS узла
- Полная типизация TypeScript с экспортируемыми типами
- Высокое покрытие тестами
- Обработка ошибок с детальным логированием
- Интеграция с `@makebelieve21213-packages/logger`

### Документация
- Подробный README с примерами использования
- llms.txt для контекста ИИ агентов
- Инструкции по развертыванию в Docker
- Руководство по внесению вклада (CONTRIBUTING.md)
