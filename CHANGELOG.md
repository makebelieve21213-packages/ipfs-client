# Changelog

Все значимые изменения в этом проекте будут документироваться в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/),
и этот проект придерживается [Semantic Versioning](https://semver.org/lang/ru/).

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
