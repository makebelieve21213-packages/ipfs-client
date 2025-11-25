# @packages/ipfs-client

IPFS клиент для NestJS с поддержкой TypeScript и полной типобезопасностью.

## 📋 Содержание

- [Возможности](#-возможности)
- [Требования](#-требования)
- [Установка](#-установка)
- [Структура пакета](#-структура-пакета)
- [Быстрый старт](#-быстрый-старт)
- [API Reference](#-api-reference)
- [Примеры использования](#-примеры-использования)
- [Troubleshooting](#-troubleshooting)
- [Тестирование](#-тестирование)

## 🚀 Возможности

- ✅ **NestJS интеграция** - глобальный модуль с forRootAsync для простой интеграции
- ✅ **Type-safe API** - полная типобезопасность TypeScript с экспортируемыми типами
- ✅ **IPFS клиент** - использование helia с HTTP gateway для подключения к IPFS узлам
- ✅ **Конфигурация** - поддержка настройки через ConfigModule
- ✅ **Обработка ошибок** - детальная обработка ошибок API с логированием
- ✅ **Высокое покрытие тестами** - надежность и качество кода

## 📋 Требования

- **Node.js**: >= 22.11.0
- **NestJS**: >= 11.0.0
- **IPFS узел**: Запущенный IPFS узел (например, go-ipfs)

## 📦 Установка

```bash
npm install @packages/ipfs-client
```

### Зависимости

```json
{
  "@nestjs/common": "^11.0.0",
  "@nestjs/config": "^11.0.0",
  "@makebelieve21213-packages/logger": "^1.0.0",
  "helia": "^5.0.0",
  "@helia/http": "^1.0.0",
  "reflect-metadata": "^0.1.13 || ^0.2.0"
}
```

## 📁 Структура пакета

```
src/
├── main/                    # NestJS модуль
├── types/                   # TypeScript типы
├── utils/                   # Утилиты
└── index.ts                 # Экспорты
```

## 🏗️ Архитектура

Пакет предоставляет NestJS глобальный модуль `IpfsCoreModule` для работы с IPFS через HTTP gateway с использованием helia.

**Основные компоненты:**
- `IpfsCoreModule` - NestJS глобальный модуль
- `IpfsCoreService` - сервис для работы с IPFS
- `IpfsConfig` - конфигурация клиента

## 🔧 Быстрый старт

### Шаг 1: Настройка переменных окружения

```env
IPFS_URL=http://localhost:5001  # URL вашего IPFS узла
```

### Шаг 2: Создание конфигурации

Создайте файл `ipfs.config.ts` в вашем сервисе:

```typescript
import { registerAs } from "@nestjs/config";
import type { IpfsConfig } from "@packages/ipfs-client";
import { CONFIG_SYMBOLS } from "@packages/types";

const ipfsConfig = registerAs<IpfsConfig>(CONFIG_SYMBOLS.IPFS_CONFIG, () => ({
    url: process.env.IPFS_URL || "http://localhost:5001",
}));

export default ipfsConfig;
```

### Шаг 3: Регистрация модуля

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IpfsCoreModule } from '@packages/ipfs-client';
import type { IpfsConfig } from '@packages/ipfs-client';
import { CONFIG_SYMBOLS } from '@packages/types';
import ipfsConfig from 'src/configs/ipfs.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [ipfsConfig],
    }),
    IpfsCoreModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (...args: unknown[]) => {
        const configService = args[0] as ConfigService;
        return configService.get<IpfsConfig>(CONFIG_SYMBOLS.IPFS_CONFIG)!;
      },
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

### Шаг 4: Использование сервиса

```typescript
// file.service.ts
import { Injectable } from '@nestjs/common';
import { IpfsCoreService } from '@packages/ipfs-client';

@Injectable()
export class FileService {
  constructor(private readonly ipfs: IpfsCoreService) {}

  async saveFile(data: string): Promise<string> {
    return await this.ipfs.addFile(data);
  }
}
```

## 📚 API Reference

### IpfsCoreModule

**forRootAsync(options):**

```typescript
IpfsCoreModule.forRootAsync({
  useFactory: (...args: unknown[]) => {
    const configService = args[0] as ConfigService;
    return configService.get<IpfsConfig>(CONFIG_SYMBOLS.IPFS_CONFIG)!;
  },
  inject: [ConfigService],
  imports: [ConfigModule],
})
```

**Экспортирует:** `IpfsCoreService` (глобально)

### IpfsCoreService

**Конфигурация:**
- `url: string` - URL IPFS узла (например, http://localhost:5001)

**Методы:**

#### `addFile(data)`

Добавляет файл в IPFS и возвращает CID.

```typescript
addFile(data: Uint8Array | string): Promise<string>
```

#### `addJson(obj)`

Сериализует объект в JSON и добавляет в IPFS.

```typescript
addJson(obj: object): Promise<string>
```

#### `getFile(cid)`

Получает файл из IPFS по CID.

```typescript
getFile(cid: string): Promise<Buffer>
```

## 🧪 Примеры использования

### Добавление файла

```typescript
// Добавление строки
const cid = await this.ipfs.addFile('Hello, IPFS!');
console.log(`CID: ${cid}`);

// Добавление бинарных данных
const buffer = new Uint8Array([1, 2, 3, 4]);
const cid = await this.ipfs.addFile(buffer);
```

### Добавление JSON объекта

```typescript
const metadata = {
  name: "My NFT",
  description: "Awesome NFT metadata",
  image: "ipfs://QmHash..."
};
const jsonCid = await this.ipfs.addJson(metadata);
console.log(`JSON CID: ${jsonCid}`);
```

### Получение файла

```typescript
const buffer = await this.ipfs.getFile("QmYourCidHash");
const content = buffer.toString('utf8');

// Для JSON
const jsonBuffer = await this.ipfs.getFile(jsonCid);
const parsedData = JSON.parse(jsonBuffer.toString());
```

### Работа с метаданными NFT

```typescript
@Injectable()
export class NftMetadataService {
  constructor(private readonly ipfs: IpfsCoreService) {}

  async saveNftMetadata(metadata: {
    name: string;
    description: string;
    image: string;
    attributes: Array<{ trait_type: string; value: string }>;
  }): Promise<string> {
    const cid = await this.ipfs.addJson(metadata);
    return `ipfs://${cid}`;
  }

  async getNftMetadata(ipfsUrl: string) {
    const cid = ipfsUrl.replace('ipfs://', '');
    const buffer = await this.ipfs.getFile(cid);
    return JSON.parse(buffer.toString('utf-8'));
  }
}
```

## 🚨 Troubleshooting

### IPFS узел недоступен

**Решение:** Убедитесь, что IPFS узел запущен (`ipfs daemon`), проверьте правильность URL в конфигурации.

### Connection refused

**Решение:** Проверьте, что IPFS узел доступен по указанному URL, проверьте настройки файрвола.

### CID не найден

**Решение:** Убедитесь, что файл был успешно добавлен в IPFS, проверьте правильность CID.

## 🧪 Тестирование

Пакет имеет **высокое покрытие тестами**.

```bash
pnpm test                # Все тесты
pnpm test:coverage       # С покрытием
```

## 🔧 Конфигурация

```typescript
interface IpfsConfig {
  url: string;  // URL IPFS узла (например, http://localhost:5001)
}
```

**Примечание:** Конфигурация должна создаваться в сервисе, который использует пакет.

## 📦 Зависимости

- `@nestjs/common` - NestJS core
- `@nestjs/config` - NestJS config
- `@makebelieve21213-packages/logger` - Логирование
- `helia` - IPFS клиент
- `@helia/http` - HTTP gateway для helia
- `reflect-metadata` - TypeScript decorators

## 📄 Лицензия

MIT

## 👥 Автор

Skryabin Aleksey
