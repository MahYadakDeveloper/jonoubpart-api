<div dir='rtl'>

# معماری قرارداد مشترک بین jonoubpart-api و jonoubpart-clients (نسخه‌ی کامل)

این سند جمع‌بندی بررسی‌ها درباره‌ی نحوه‌ی تعریف قرارداد (اسکیما و خطاها) در مرز HTTP بین سرور و کلاینت‌ها است: مقایسه‌ی روش‌ها، تصمیم پیشنهادی، ساختار ریپو، ساختار پکیج مشترک، ابزارها، **راهنمای اجرای قدم‌به‌قدم**، **نکات قرارگیری `node_modules`** و تله‌های رایج.

## فهرست

1. خلاصه‌ی تصمیم
2. مقایسه‌ی OpenAPI و پکیج مشترک
3. GraphQL در این تصویر کجاست؟
4. یک ریپو یا دو ریپو؟
5. پکیج مشترک دقیقاً چیست؟
6. الگوی خطاها
7. ابزارها
8. ریسک‌هایی که ریپوی واحد حذف نمی‌کند
9. راهنمای اجرا (قدم‌به‌قدم)
10. قرارگیری `node_modules` و نصب وابستگی‌ها
11. نکات مهم و تله‌های رایج
12. عیب‌یابی سریع
13. چک‌لیست تصمیم‌ها و تکمیل کار

---

## ۱. خلاصه‌ی تصمیم

- **قرارداد بین API و کلاینت‌ها با یک پکیج مشترک TypeScript (مبتنی بر Zod) تعریف شود**، نه با OpenAPI به‌عنوان منبع اصلی.
- **API و کلاینت‌ها در یک ریپوی واحد** قرار بگیرند تا تغییر قرارداد، سرور و کلاینت به‌صورت اتمیک انجام شود.
- **GraphQL فعلاً لازم نیست.** مشکل فعلی over-fetching یا تعداد زیاد درخواست‌ها نیست و هزینه‌ی GraphQL بیشتر از فایده‌اش است.
- **OpenAPI در صورت نیاز بعداً** از روی همان اسکیماهای Zod تولید می‌شود (برای مصرف‌کننده‌ی غیر TS یا مستندات پارتنر)، یعنی انتخاب پکیج مشترک راه OpenAPI را نمی‌بندد.
- **ابزار پایه Bun است** (package manager و runtime)؛ همه‌ی دستورها و مثال‌های این سند با Bun نوشته شده‌اند.

## ۲. مقایسه‌ی OpenAPI و پکیج مشترک

شرایط پروژه: همه‌ی اپ‌ها با TypeScript نوشته شده‌اند و هر دو سمت تحت کنترل کامل هستند.

| معیار                  | پکیج مشترک (Zod)                         | OpenAPI (Swagger)                               |
| ---------------------- | ---------------------------------------- | ----------------------------------------------- |
| همگام‌سازی سرور و کلاینت | فوری، در زمان کامپایل                    | وابسته به pipeline تولید spec و کلاینت           |
| اعتبارسنجی runtime     | روی هر دو سمت                            | معمولاً فقط سرور؛ کدجنریشن بیشتر فقط type می‌دهد   |
| مدل‌سازی خطاها          | طبیعی (union، type guard، کد خطای مشترک) | دست‌وپاگیر؛ خروجی کدجنریتورها اغلب ناخوشایند است |
| پیچیدگی ابزار          | کم                                       | متوسط (generator، مرحله‌ی CI)                    |
| کلاینت غیر TS           | نیازمند تولید spec اضافه                 | عالی                                            |
| تجربه‌ی توسعه           | go-to-definition مستقیم به قرارداد       | پرش به فایل تولیدشده                            |

### مزیت‌های پکیج مشترک

- **یک منبع حقیقت واقعی:** type، اسکیما و validator از یک تعریف می‌آیند.
- **اعتبارسنجی دو طرفه:** سرور ورودی را بررسی می‌کند؛ کلاینت می‌تواند پاسخ را validate کند یا همان اسکیما را برای فرم‌ها استفاده کند.
- **خطاهای مشترک:** کدهای خطا، ساختار پیام و type guardها یک‌جا تعریف می‌شوند.
- **refactor امن:** تغییر در پکیج یعنی خطای کامپایل فوری در هر دو سمت.

### ریسک‌ها و نقاط ضعف

- **coupling:** سرور و کلاینت به هم گره می‌خورند. برای اپ موبایل که کاربر دیر آپدیت می‌کند، باید قواعد سازگاری رعایت شود (بخش ۸).
- **وابستگی به TypeScript:** اگر روزی کلاینت غیر TS (مثلاً Swift یا Kotlin بومی) اضافه شد، باید spec تولید شود.
- **پکیج باید سبک بماند:** نشت هر چیز از Nest یا Drizzle باندل Expo را سنگین یا خراب می‌کند.

## ۳. GraphQL در این تصویر کجاست؟

GraphQL پروتکل انتقال نیست؛ یک **زبان کوئری و مدل اسکیما** است که معمولاً روی HTTP سوار می‌شود (یک endpoint واحد مثل `POST /graphql`) و subscriptionها روی WebSocket یا SSE می‌روند. پس مرز HTTP همچنان می‌ماند و فقط شکل قرارداد فرق می‌کند.

### تفاوت با REST

- **REST:** چند endpoint، هر کدام با متد، status code و شکل پاسخ مشخص.
- **GraphQL:** یک endpoint؛ کلاینت فیلدهای موردنیازش را در کوئری مشخص می‌کند و SDL قرارداد است.
- در GraphQL معمولاً status همیشه `200` است و خطاها داخل فیلد `errors` می‌آیند (با `extensions.code`). این با الگوی status code در REST فرق دارد و ابزارهای HTTP مثل کش، rate limit و مانیتورینگ را سخت‌تر می‌کند.

### هزینه‌ها برای این پروژه

- **پیچیدگی سرور:** resolverها، مشکل N+1 (نیاز به DataLoader)، محدودکردن عمق و هزینه‌ی کوئری، و تعامل نه‌چندان ساده با Drizzle.
- **کدجنریشن:** برای type سمت کلاینت دوباره یک pipeline لازم می‌شود (graphql-codegen).
- **کش و rate limit:** چون همه‌چیز `POST /graphql` است، کش HTTP عملاً کار نمی‌کند و throttling باید بر اساس کوئری باشد.
- **آپلود و دانلود فایل:** معمولاً بیرون از GraphQL و با REST انجام می‌شود.

### چه موقع ارزش دارد؟

- کلاینت‌های متعدد با نیازهای داده‌ای متفاوت از یک موجودیت (موبایل، پنل وب، داشبورد).
- صفحاتی که چند منبع تودرتو را باید در یک رفت‌وبرگشت بگیرند و شبکه‌ی ضعیف مهم است.
- تیم‌های جدای فرانت و بک که باید مستقل از هم جلو بروند.

در صورت نیاز واقعی می‌توان GraphQL را فقط برای بخش‌های خاص (مثلاً گزارش‌ها یا لیست‌های پیچیده) کنار REST اضافه کرد.

## ۴. یک ریپو یا دو ریپو؟

ارزش اصلی پکیج مشترک **تغییر اتمیک** است: یک commit که قرارداد، سرور و کلاینت را با هم عوض می‌کند و CI همان لحظه خطای کامپایل می‌دهد. با ریپوهای جدا این مزیت از بین می‌رود.

| گزینه                                                  | مزیت                                      | عیب                                                                       |
| ------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------- |
| **یک ریپو** (`api` + `clients` + `packages/contracts`) | تغییر اتمیک، بدون publish، ساده‌ترین ابزار | کانفیگ ریشه‌ی مشترک، CI باید هوشمند باشد                                   |
| **دو ریپو + پکیج publish‌شده** (registry خصوصی)         | جدایی کامل ریپوها                         | هر تغییر قرارداد یعنی publish، bump و install در دو جا؛ خطر ناهمگامی نسخه |
| **دو ریپو + git submodule**                            | بدون registry                             | تجربه‌ی بد و مستعد اشتباه؛ توصیه نمی‌شود                                    |

**پیشنهاد:** یک ریپوی واحد، مگر اینکه تیم‌های جدا با چرخه‌ی انتشار مستقل داشته باشید.

### نحوه‌ی ادغام

چون هر دو پروژه الان خودشان monorepo هستند، لازم نیست ساختار داخلی‌شان بازنویسی شود. یک ریشه‌ی بالاتر ساخته می‌شود:

```
jonoubpart/
  package.json            // workspaces + catalog
  bunfig.toml             // تنظیمات نصب (linker)
  bun.lock                // تنها lockfile کل ریپو
  tsconfig.base.json
  packages/
    contracts/            // پکیج مشترک
  api/                    // همان monorepo فعلی (apps, features, shared, ...)
  clients/                // همان monorepo فعلی (apps/customer-mobile, ...)
```

نکته‌های عملی:

- **تاریخچه‌ی git** با `git subtree add` یا `git filter-repo` منتقل شود تا از دست نرود (جزئیات در بخش ۹).
- **کانفیگ‌های ریشه‌ی هر طرف** (tsconfig، oxlint، `expo.config.ts` مشترک و پلاگین Gradle در `.tools`) داخل پوشه‌ی `clients/` بمانند تا با ریشه‌ی جدید قاطی نشوند. فقط `tsconfig.base.json` واقعاً مشترک به ریشه بالا برود.
- **`node_modules`:** قرارگیری آن‌ها بزرگ‌ترین نقطه‌ی حساس ادغام است؛ بخش ۱۰ را کامل بخوانید.
- **CI:** با path filter یا ابزار affected طوری تنظیم شود که تغییر در `clients/` بیلد و تست `api/` را اجرا نکند و تغییر در `packages/contracts` هر دو را اجرا کند.

## ۵. پکیج مشترک دقیقاً چیست؟

یک workspace package که **فقط قرارداد HTTP** را تعریف می‌کند و هیچ منطق زیرساختی ندارد.

### قاعده‌ی طلایی وابستگی

```
contracts  ←  api
contracts  ←  clients
```

`contracts` هیچ چیزی از api یا clients import نمی‌کند و وابستگی‌اش فقط `zod` است: نه Nest، نه Drizzle، نه React Native، **نه ماژول‌های داخلی Node** (`node:fs`، `node:path` و ...).

در معماری فعلی (oxlint + boundaries) یک element جدید به نام `contracts` تعریف شود. پیشنهاد این است که فقط لایه‌ی `http` (و در صورت نیاز `api`) اجازه‌ی import از آن داشته باشند و `impl` نداشته باشد، تا دامنه از شکل قرارداد HTTP مستقل بماند. تبدیل خطاهای دامنه به کدهای خطای قرارداد (mapping) هم در همان لایه‌ی `http` انجام شود. این یک پیشنهاد است و بسته به نحوه‌ی ساخت لایه‌ها قابل تغییر است.

### چه چیزی داخلش می‌رود

1. اسکیمای request/response هر endpoint (body، query، params، response)
2. پوشش خطا: envelope ثابت و کدهای خطای پایدار
3. نوع‌های مشترک: pagination، شناسه‌ها، enumهای قابل‌نمایش
4. توصیف route (متد + مسیر + اسکیماها)، اگر از ts-rest یا مشابه استفاده شود

### چه چیزی نباید برود

- اسکیمای جدول‌های Drizzle (قرارداد API باید مستقل از شکل جدول‌های DB باشد؛ در صورت استفاده از `drizzle-zod` فقط به‌عنوان نقطه‌ی شروع و با تنظیم دستی تا فیلدهای داخلی لو نروند)
- منطق کسب‌وکار
- کلاس‌های Nest
- هر چیزی که فقط یک طرف لازم دارد

### ساختار پیشنهادی

```
packages/contracts/
  package.json
  tsconfig.json
  src/
    index.ts
    common/
      error.ts          // ApiError envelope + کدهای عمومی
      pagination.ts
    auth/
      index.ts
      schemas.ts        // zod: body, query, params, response
      errors.ts         // کدهای خطای این feature
    catalog/
      ...
```

```json
{
  "name": "@jonoubpart/contracts",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "sideEffects": false,
  "exports": {
    ".": "./src/index.ts",
    "./auth": "./src/auth/index.ts",
    "./catalog": "./src/catalog/index.ts"
  },
  "dependencies": { "zod": "catalog:" }
}
```

مصرف در هر دو سمت: `"@jonoubpart/contracts": "workspace:*"`.

**subpath exportها** مهم‌اند: اپ موبایل فقط همان feature‌ای را import می‌کند که لازم دارد و باندل کوچک می‌ماند. `sideEffects: false` هم کمک می‌کند bundlerها بخش‌های بلااستفاده را حذف کنند. اگر حجم Zod در موبایل مسئله شد، `zod/mini` بررسی شود.

### مدل Just-in-time یا build‌شده؟

- **JIT (پیشنهادی):** پکیج مستقیماً سورس `.ts` را export می‌کند، بدون مرحله‌ی build. Metro و bundlerهای مدرن TS را از workspace package می‌خوانند، و سرور اگر با Bun اجرا یا با bundler بیلد شود مشکلی ندارد. برای Next.js باید پکیج در `transpilePackages` ثبت شود (بخش ۹، گام ۶).
- **Build‌شده (tsdown یا tsup):** فقط اگر مصرف‌کننده‌ای باشد که TS نمی‌فهمد، یا بخواهید پکیج را بیرون از monorepo منتشر کنید.

اگر بیلد Nest فقط `dist` را اجرا می‌کند و سورس workspace را transpile نمی‌کند (مثلاً `nest build` با `tsc` و `rootDir` محدود به خود اپ)، همین‌جا مشکل پیش می‌آید. در آن صورت یا بیلد با یک bundler (مثل `bun build --target bun`) انجام شود، یا اجرای مستقیم با Bun، یا پکیج build‌شده شود.

## ۶. الگوی خطاها

یک envelope ثابت برای همه‌ی خطاها:

```ts
// packages/contracts/src/common/error.ts
import { z } from 'zod';

// کدهای شناخته‌شده؛ فقط اضافه می‌شوند، هرگز حذف یا تغییرنام نمی‌دهند.
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INTERNAL',
  // کدهای feature‌ها از فایل errors.ts هر feature spread می‌شوند
] as const;
export type KnownErrorCode = (typeof ERROR_CODES)[number];

export const ApiErrorSchema = z.object({
  // روی سیم «string» است نه enum، تا کد جدید سرور اپ قدیمی را نشکند
  code: z.string(),
  message: z.string(), // برای لاگ، نه نمایش به کاربر
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const isKnownErrorCode = (code: string): code is KnownErrorCode =>
  (ERROR_CODES as readonly string[]).includes(code);
```

قواعد:

- کلاینت روی `code` سوییچ می‌کند و متن نمایشی را خودش (i18n) می‌سازد.
- کدها **هرگز تغییر نام نمی‌دهند یا حذف نمی‌شوند**؛ فقط اضافه می‌شوند.
- **فیلد `code` در اسکیمای wire عمداً `z.string()` است، نه `z.enum`.** اگر `z.enum` باشد، اپ قدیمی هنگام دریافت کد جدید در parse شکست می‌خورد و حتی نمی‌تواند خطای عمومی نشان دهد. تشخیص «کد شناخته‌شده» با `isKnownErrorCode` انجام می‌شود.
- کلاینت باید کد ناشناخته را به یک خطای عمومی تبدیل کند.
- همین احتیاط برای **enumهای داخل response** هم لازم است: اگر ممکن است مقدار جدیدی به آن‌ها اضافه شود، سمت کلاینت از شکل تحمل‌پذیر (مثلاً `.catch("unknown")` یا `z.enum([...]).or(z.string())`) استفاده شود.

## ۷. ابزارها

### هسته (ضروری)

- **Bun workspaces:** `workspace:*` و نصب یکپارچه (همین الان در پروژه استفاده می‌شود). برای هم‌نسخه نگه‌داشتن وابستگی‌های مشترک (zod، typescript، react) از **catalog** در `package.json` ریشه استفاده شود.
- **Zod 4:** اسکیما، type و validation در یک تعریف. نسخه‌ی ۴ خودش `z.toJSONSchema()` دارد و ساخت OpenAPI را بعداً ساده می‌کند.
- **TypeScript** با یک `tsconfig.base.json` مشترک، و در صورت نیاز project references برای تایپ‌چک افزایشی.

### سمت سرور (NestJS)

- **`nestjs-zod`:** pipe اعتبارسنجی، DTO از روی اسکیمای Zod و serializer برای response.
- یا یک `ZodValidationPipe` ساده‌ی دست‌نویس (حدود ده خط) اگر وابستگی اضافه نمی‌خواهید (نمونه در بخش ۹، گام ۵).
- خروجی را می‌توان در لایه‌ی http با `schema.parse` بررسی کرد (حداقل در dev و test).

### سمت کلاینت

- **TanStack Query** برای کش و state سرور.
- یکی از این سه برای لایه‌ی fetch:
  - **ts-rest:** قرارداد یک بار تعریف می‌شود و هم کلاینت typed و هم کنترلر Nest (`@ts-rest/nest`) از آن مشتق می‌شوند. نزدیک‌ترین چیز به «قرارداد مشترک رسمی».
  - **zodios:** مشابه ولی سبک‌تر.
  - **wrapper دست‌نویس** حدود ۳۰ خط روی `fetch`؛ اگر تعداد endpointها کم است شاید بهترین انتخاب باشد (نمونه در بخش ۹، گام ۶).

### ابزار monorepo (اختیاری)

- **Turborepo:** اجرای taskها با cache و گراف وابستگی. دستور `turbo run typecheck --filter=...[origin/main]` فقط پکیج‌های affected را اجرا می‌کند. با Bun سازگار است.
- **Nx:** قدرتمندتر ولی سنگین‌تر؛ برای این پروژه احتمالاً زیاده.
- در شروع می‌توان بدون هیچ‌کدام و با `bun --filter` جلو رفت.

### ابزارهای رسمی که کار را ساده می‌کنند

- **راهنمای رسمی monorepo در Expo:** از SDK 52 به بعد Expo خودش Metro را برای monorepo پیکربندی می‌کند و دیگر نیازی به تنظیم دستی `watchFolders` و `nodeModulesPaths` نیست. قبل از شروع، مستندات رسمی «Work with monorepos» با نسخه‌ی SDK پروژه تطبیق داده شود.
- **`@nestjs/swagger`:** فقط در صورت نیاز به OpenAPI (مستندات برای پارتنر یا کلاینت غیر TS).
- **`@asteasolutions/zod-to-openapi`** یا `z.toJSONSchema` در Zod 4: ساخت spec از همان اسکیماها.
- **Standard Schema:** مشخصه‌ای که Zod، Valibot و ArkType همه پیاده می‌کنند؛ اگر کتابخانه‌ای مثل ts-rest آن را بپذیرد، عوض‌کردن validator در آینده بدون بازنویسی کل پروژه ممکن می‌شود.
- **Changesets:** فقط اگر روزی پکیج بیرون از monorepo منتشر شود.

## ۸. ریسک‌هایی که ریپوی واحد حذف نمی‌کند

### الف) اپ‌های قدیمی در دست کاربر

حتی با یک ریپو، نسخه‌ی نصب‌شده‌ی اپ موبایل با سرور جدید حرف می‌زند. قواعد:

- تغییرات قرارداد فقط **additive** باشند (فیلد اختیاری جدید، کد خطای جدید).
- کلاینت کد خطای ناشناخته را به‌صورت graceful هندل کند (بخش ۶).
- برای تغییر شکننده از prefix نسخه (`/v2`) یا حداقل‌نسخه‌ی اپ (force update) استفاده شود.
- از خروجی `z.toJSONSchema` قرارداد یک **تست snapshot** گرفته شود تا تغییر شکننده‌ی ناخواسته در CI گرفته شود.
- فیلد **required جدید در request** برای اپ قدیمی شکننده است (اپ قدیمی آن را نمی‌فرستد)؛ فیلد جدید request باید optional یا دارای default باشد.

### ب) نشت زیرساخت به پکیج

هر import از Nest یا Drizzle داخل `contracts` باندل Expo را می‌شکند یا سنگین می‌کند. با قانون lint (همان boundaries) تعریف شود که `contracts` فقط اجازه‌ی import از `zod` و خودش را دارد.

---

## ۹. راهنمای اجرا (قدم‌به‌قدم)

هر گام یک «معیار تکمیل» دارد؛ تا برقرارنبودن آن به گام بعد نروید. همه‌ی دستورها داخل **WSL2 و روی فایل‌سیستم لینوکس** (مثلاً `~/dev/personal/`) اجرا شوند، نه زیر `/mnt/c`.

### گام ۰: آماده‌سازی و بکاپ

1. هر دو ریپو را به وضعیت **سبز** برسانید (بیلد، تایپ‌چک، تست) و تغییرات commit‌نشده را تمیز کنید.
2. از هر دو ریپو tag بگیرید تا نقطه‌ی بازگشت داشته باشید:

   ```bash
   git tag pre-monorepo-merge && git push --tags
   ```

3. PRها و branchهای باز را یادداشت کنید (بعد از ادغام باید rebase یا دوباره باز شوند).
4. نسخه‌ها را ثبت کنید: `bun --version`، `node --version`، نسخه‌ی SDK اکسپو (`expo` در `package.json`)، نسخه‌ی Zod.
5. **Node باید نصب بماند** حتی اگر runtime پروژه Bun است: Gradle/autolinking اکسپو و React Native در پشت صحنه `node` را صدا می‌زنند.
6. حجم تاریخچه و فایل‌های بزرگ را بررسی کنید (`git count-objects -vH`)؛ اگر `node_modules` یا فایل باینری بزرگ تصادفاً commit شده، قبل از انتقال با `git filter-repo` پاک شود.

**معیار تکمیل:** tag ساخته شده و هر دو ریپو به‌تنهایی بیلد می‌شوند.

### گام ۱: ساخت ریشه و انتقال ریپوها با تاریخچه

```bash
mkdir -p ~/dev/personal/jonoubpart && cd ~/dev/personal/jonoubpart
git init -b main
git commit --allow-empty -m "chore: init monorepo root"

# بدون --squash تا تاریخچه‌ی کامل بماند
git subtree add --prefix=api     ../jonoubpart-api     main
git subtree add --prefix=clients ../jonoubpart-clients main
```

نکات:

- اگر شاخه‌ی اصلی `master` یا نام دیگری است، همان را بدهید.
- `git subtree` تاریخچه را با مسیر پیشوند‌دار نگه می‌دارد. اگر می‌خواهید `git log --follow` روی فایل‌ها دقیق‌تر کار کند، گزینه‌ی `git filter-repo --to-subdirectory-filter api` روی یک clone موقت قبل از ادغام بهتر است.
- ریپوهای قدیمی را **حذف نکنید**؛ بعد از پایدارشدن ادغام آرشیو (archive) کنید.
- فایل‌های ریشه‌ی قدیمی که حالا داخل `api/` و `clients/` هستند (مثل `.gitignore`، `.github/workflows`، `.vscode`) را بررسی کنید: workflowهای GitHub فقط از `.github/` **ریشه‌ی ریپو** خوانده می‌شوند و باید به ریشه‌ی جدید منتقل و اصلاح شوند.

**معیار تکمیل:** `git log -- api/` و `git log -- clients/` تاریخچه‌ی قبلی را نشان می‌دهد.

### گام ۲: فایل‌های ریشه

`package.json` ریشه (globهای `workspaces` را از دو ریشه‌ی قبلی بردارید و پیشوند `api/` و `clients/` بدهید؛ نمونه‌ی زیر فقط شکل کلی است):

```json
{
  "name": "jonoubpart",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/*",
    "api/apps/*",
    "api/features/**",
    "api/shared/*",
    "api/infrastructure/*",
    "clients/apps/*",
    "clients/packages/*"
  ],
  "catalog": { "zod": "^4.0.0", "typescript": "^5.9.0" },
  "overrides": { "zod": "^4.0.0" }
}
```

- `catalog` نسخه‌ی مشترک را یک‌جا تعریف می‌کند و هر پکیج با `"zod": "catalog:"` به آن ارجاع می‌دهد.
- `overrides` تضمین می‌کند وابستگی‌های transitive هم همان نسخه را بگیرند (از دو کپی Zod جلوگیری می‌کند).
- اگر الگوی globهای واقعی شما با نمونه‌ی بالا فرق دارد (مثلاً گروه‌بندی features به `store/`، `logistics/`، `iam/`)، globهای موجود خودتان را مبنا قرار دهید، نه این نمونه.

`bunfig.toml` ریشه (انتخاب linker را **صریح** بنویسید؛ بخش ۱۰):

```toml
[install]
linker = "isolated"
```

`tsconfig.base.json` ریشه: فقط تنظیمات واقعاً مشترک (`strict`، `target`، `moduleResolution: "bundler"`، `skipLibCheck`، `verbatimModuleSyntax`). tsconfigهای ویژه‌ی هر طرف (decorator و `emitDecoratorMetadata` برای Nest، `jsx` برای کلاینت) داخل `api/` و `clients/` بمانند و از base ارث ببرند.

`.gitignore` ریشه:

```
**/node_modules
**/dist
**/.expo
**/.next
**/.turbo
```

**معیار تکمیل:** فایل‌ها commit شده‌اند؛ هنوز چیزی نصب نشده.

### گام ۳: تمیزکاری و اولین نصب یکپارچه

```bash
# حذف همه‌ی node_modules و lockfileهای قدیمی
find . -name node_modules -type d -prune -exec rm -rf {} +
rm -f api/bun.lock clients/bun.lock api/pnpm-lock.yaml api/pnpm-workspace.yaml

# نصب فقط از ریشه
bun install
```

- **هرگز داخل `api/` یا `clients/` جداگانه `bun install` نزنید**؛ فقط یک lockfile در ریشه باید وجود داشته باشد.
- اگر `api/` هنوز با pnpm مدیریت می‌شد، `pnpm-workspace.yaml` و کانفیگ‌های وابسته به pnpm (مثل `.npmrc` مخصوص pnpm، فیلد `packageManager`) حذف یا به Bun تبدیل شوند.
- وابستگی‌های `workspace:*` موجود در دو طرف باید اکنون resolve شوند. اگر پکیجی با دو نام یکسان در هر دو ریپو بود، تداخل نام را قبل از نصب رفع کنید.
- ناسازگاری نسخه‌های مشترک (react، typescript، zod) را با `bun why zod` و مشابه بررسی و در catalog یکی کنید.

اعتبارسنجی بدون هیچ تغییر کد:

```bash
bun run --filter '*' typecheck     # یا اسکریپت‌های موجود خودتان
bun run --filter './api/apps/*' build
cd clients/apps/customer-mobile && bunx expo start --clear
```

**معیار تکمیل:** هر دو طرف دقیقاً مثل قبل از ادغام بیلد و اجرا می‌شوند. اگر نه، ادغام را تا رفع مشکل جلو نبرید (بخش ۱۲).

### گام ۴: ساخت `packages/contracts` با یک feature کوچک

```bash
mkdir -p packages/contracts/src/{common,auth}
cd packages/contracts
# package.json را مطابق بخش ۵ بنویسید، سپس:
bun add zod
cd ../..
```

نمونه‌ی `src/auth/schemas.ts`:

```ts
import { z } from 'zod';

export const LoginBody = z.object({
  phone: z.string().min(10),
  code: z.string().length(6),
});
export type LoginBody = z.infer<typeof LoginBody>;

export const LoginResponse = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int(),
});
export type LoginResponse = z.infer<typeof LoginResponse>;
```

`src/auth/errors.ts`:

```ts
export const AUTH_ERROR_CODES = [
  'AUTH_INVALID_CODE',
  'AUTH_CODE_EXPIRED',
] as const;
```

و `src/auth/index.ts` همه‌ی این‌ها را re-export کند. `src/index.ts` فقط چیزهای واقعاً عمومی (`common/*`) را export کند، نه همه‌ی featureها (تا subpath exportها معنا داشته باشند).

**معیار تکمیل:** `bun run --filter @jonoubpart/contracts typecheck` موفق است و پکیج هیچ import غیر از `zod` ندارد.

### گام ۵: اتصال سمت Nest

ابتدا وابستگی را به اپ/ماژول http اضافه کنید (در `package.json` همان workspace):

```json
"dependencies": { "@jonoubpart/contracts": "workspace:*" }
```

سپس `bun install` در **ریشه**.

pipe ساده:

```ts
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: z.ZodType) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        details: z.treeifyError(result.error),
      });
    }
    return result.data;
  }
}
```

کنترلر:

```ts
import { LoginBody, type LoginResponse } from "@jonoubpart/contracts/auth";

@Post("login")
login(@Body(new ZodValidationPipe(LoginBody)) body: LoginBody): Promise<LoginResponse> {
  return this.loginCommand.execute(body);
}
```

نکات:

- **فیلتر استثنای سراسری** (exception filter) بنویسید تا هر خطا (دامنه، validation، ناشناخته) به envelope `ApiError` تبدیل شود. کلاینت نباید هرگز شکل خطای دیگری ببیند.
- نگاشت خطای دامنه به `code` قرارداد در لایه‌ی http انجام شود، نه در دامنه.
- در dev و test خروجی را با `Schema.parse` بررسی کنید تا ناهمخوانی پاسخ و قرارداد زود پیدا شود.
- پکیج‌های feature در api ممکن است `type: commonjs` باشند و `contracts` `type: module`؛ زیر **runtime Bun** مشکلی ندارد، ولی اگر Nest را با `tsc` به CJS بیلد و با Node اجرا می‌کنید، import یک پکیج ESM با سورس `.ts` شکست می‌خورد. راه‌حل در بخش ۵ (مدل JIT یا build‌شده) آمده است.

**معیار تکمیل:** درخواست نامعتبر `400` با envelope استاندارد برمی‌گرداند و درخواست معتبر `LoginResponse` مطابق اسکیما.

### گام ۶: اتصال سمت کلاینت

وابستگی را به اپ اضافه کنید (`"@jonoubpart/contracts": "workspace:*"`) و در ریشه `bun install` بزنید.

wrapper نمونه (حدود ۳۰ خط):

```ts
import { ApiErrorSchema, isKnownErrorCode } from '@jonoubpart/contracts';
import { z } from 'zod';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string, // ممکن است ناشناخته باشد
    public readonly details?: unknown,
  ) {
    super(code);
  }
  get isKnown() {
    return isKnownErrorCode(this.code);
  }
}

export async function apiCall<S extends z.ZodType>(
  path: string,
  init: RequestInit,
  response: S,
): Promise<z.infer<S>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(json);
    throw new ApiRequestError(
      res.status,
      parsed.success ? parsed.data.code : 'UNKNOWN',
      parsed.success ? parsed.data.details : undefined,
    );
  }
  return response.parse(json);
}
```

نکات:

- `BASE_URL` از env بخوانید: در Expo با پیشوند `EXPO_PUBLIC_` و در Next.js با `NEXT_PUBLIC_`. روی اندروید امولاتور `localhost` سرور شما نیست (آدرس host را بدهید).
- فرم‌ها از همان اسکیمای `LoginBody` برای اعتبارسنجی استفاده کنند (مثلاً با resolver مناسب react-hook-form).
- **Next.js (وب مشتری):** چون پکیج سورس `.ts` export می‌کند، در `next.config` اضافه کنید: `transpilePackages: ["@jonoubpart/contracts"]`. برای بیلد `standalone` یا مونوریپو، `outputFileTracingRoot` را روی ریشه‌ی ریپو بگذارید تا فایل‌های پکیج‌های workspace در خروجی بیایند.
- **Expo / Metro:** تنظیم دستی `watchFolders` لازم نیست (بخش ۷)؛ فقط بعد از ادغام `bunx expo start --clear` بزنید.

**معیار تکمیل:** یک صفحه یا اکشن در اپ، endpoint را با type کامل و parse شده‌ی response صدا می‌زند؛ تغییر یک فیلد در `contracts` هم در Nest و هم در کلاینت خطای کامپایل می‌دهد.

### گام ۷: تأیید end-to-end

1. API را اجرا کنید و از اپ (یا وب) یک جریان کامل را بزنید، از جمله یک مسیر خطا.
2. یک فیلد را عمداً در `contracts` تغییر دهید و ببینید هر دو طرف خطای تایپ می‌دهند؛ سپس برگردانید.
3. بیلد release اندروید را یک بار بزنید تا مطمئن شوید Gradle و autolinking بعد از جابه‌جایی مسیرها سالم‌اند (بخش ۱۰).

### گام ۸: قانون boundaries در oxlint

- element `contracts` برای `packages/contracts/**` تعریف شود.
- `contracts` فقط اجازه‌ی import از `zod` و خودش را دارد.
- در api فقط لایه‌ی `http` (و در صورت لزوم `api`) اجازه‌ی import از `contracts` دارند؛ `impl` ندارد.
- کلاینت‌ها آزادانه import می‌کنند.
- اگر ساختار فعلی شما بر پایه‌ی یک base config برای http و یک base config برای api است، قانون را در base مربوط اضافه کنید تا هر ماژول به‌صورت خودکار آن را بگیرد.

### گام ۹: CI به‌صورت affected

- تغییر در `packages/contracts/**` ⇒ typecheck، lint و تست **هر دو** طرف.
- تغییر فقط در `clients/**` ⇒ فقط کلاینت‌ها؛ تغییر فقط در `api/**` ⇒ فقط api.
- نصب در CI: `bun install --frozen-lockfile` از ریشه؛ cache کردن `~/.bun/install/cache`.
- در صورت استفاده از Turborepo: `turbo run typecheck test --filter=...[origin/main]`.
- workflowها در `.github/workflows/` ریشه باشند (گام ۱).

### گام ۱۰: تست snapshot قرارداد

یک تست که همه‌ی اسکیماهای endpointها را با `z.toJSONSchema` به JSON تبدیل و با snapshot ذخیره‌شده مقایسه می‌کند. هر تغییر در snapshot باید در review آگاهانه تأیید شود. تغییرهای غیر additive (حذف فیلد، required شدن فیلد request، تغییر نوع) باید در PR صراحتاً علامت بخورند.

### گام ۱۱: مهاجرت تدریجی بقیه‌ی featureها

- هر بار یک feature: ابتدا قرارداد در `contracts`، بعد سرور، بعد کلاینت، در **یک PR**.
- featureهای بدون مصرف‌کننده‌ی کلاینت لازم نیست عجله شوند.
- بعد از هر feature: بیلد bundle اپ را نگاه کنید تا حجم Zod/قرارداد بی‌دلیل بزرگ نشده باشد.

### گام ۱۲: OpenAPI (فقط در صورت نیاز)

اسکیماهای Zod را با `z.toJSONSchema` یا `@asteasolutions/zod-to-openapi` به spec تبدیل کنید و به‌عنوان artifact در CI بسازید. spec **خروجی** است، نه منبع حقیقت.

---

## ۱۰. قرارگیری `node_modules` و نصب وابستگی‌ها

این بخش مهم‌ترین قسمت ادغام دو monorepo است. اکثر مشکلات عملی از اینجا می‌آیند.

### ۱) یک ریشه، یک lockfile، یک نصب

- فقط یک `bun.lock` در ریشه‌ی ریپو باشد؛ lockfileها و `node_modules`های قدیمی `api/` و `clients/` حذف شوند.
- نصب فقط از ریشه: `bun install`. نصب انتخابی با فیلتر: `bun install --filter './clients/apps/*'`.
- اضافه‌کردن وابستگی به یک پکیج: `bun add <pkg>` از داخل پوشه‌ی همان پکیج، یا `bun add <pkg> --cwd <path>`. وابستگی مشترک را در catalog بگذارید.
- در CI و Docker از `--frozen-lockfile` استفاده کنید.

### ۲) انتخاب linker: `isolated` یا `hoisted`

|                     | `hoisted`                                                         | `isolated`                                                                                                 |
| ------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| ساختار              | بیشتر پکیج‌ها در `node_modules` ریشه، تخت                          | هر workspace فقط وابستگی‌های اعلام‌شده‌ی خودش را در `node_modules`ِ خودش (symlink به store مرکزی `.bun`) می‌بیند |
| phantom dependency  | ممکن (import بدون اعلام در `package.json` کار می‌کند)               | تقریباً غیرممکن؛ import اعلام‌نشده خطا می‌دهد                                                                  |
| ریسک برای این پروژه | Nest می‌تواند تصادفاً `react-native` یا بسته‌های UI را ببیند و برعکس | ایزوله‌ی واقعی api و clients                                                                                |
| سازگاری Metro/Expo  | قدیمی‌ترین و امن‌ترین مسیر                                          | در نسخه‌های جدید Expo پشتیبانی می‌شود؛ با SDK پروژه در مستندات تطبیق دهید                                    |

توصیه:

- در ریشه، linker را **صریح** در `bunfig.toml` بنویسید تا رفتار به نسخه‌ی Bun یا وضعیت lockfile وابسته نباشد.
- اگر الان در اپ اکسپو شما `node_modules` شامل symlink به store `.bun` ریشه است، یعنی همین‌حالا روی حالت isolated کار می‌کنید و جواب داده است؛ آن را حفظ کنید و همین تنظیم را به ریشه‌ی جدید ببرید.
- اگر بعد از ادغام Metro پکیجی را پیدا نکرد، اول `bunx expo start --clear` بزنید؛ اگر ادامه داشت، آزمایش موقت با `linker = "hoisted"` و پاک‌کردن همه‌ی `node_modules` و نصب دوباره، مشکل را از غیر آن جدا می‌کند.
- هر وقت linker را عوض کردید: **همه‌ی `node_modules` پاک و دوباره `bun install` از ریشه**.

### ۳) `node_modules` پکیج `contracts`

- `contracts` فقط `zod` دارد؛ پس `node_modules` آن تقریباً خالی/کوچک است و باید همین‌طور بماند.
- اگر چیز دیگری (Nest، Drizzle، react-native) در آن نصب شد یا import شد، یعنی قاعده‌ی وابستگی شکسته است (قانون lint بخش ۸ را ببینید).
- **تک‌نسخه بودن zod** در کل ریپو: نصب دو نسخه‌ی متفاوت باعث ناسازگاری type و رفتار (مثلاً با `nestjs-zod`) می‌شود. با catalog/overrides ثابت کنید و با `bun why zod` وارسی کنید.

### ۴) نسخه‌ی تکی برای کتابخانه‌های حساس

- `react`، `react-native` و `expo` باید یک نسخه و فقط در `clients/` باشند؛ api نباید به آن‌ها وابسته شود.
- `typescript` را از catalog بگیرید تا tsc ریشه و ابزار lint (type-aware) هم‌نسخه باشند.

### ۵) فایل‌ها و پوشه‌هایی که نباید commit شوند یا باید نادیده گرفته شوند

- `**/node_modules` در `.gitignore`.
- در `tsconfig`، oxlint و ابزارهای جستجو، `node_modules` و `dist` را exclude کنید (به‌خصوص حالا که ریشه بزرگ‌تر شده است).
- پوشه‌های cache (`.expo`، `.next`، `.turbo`) ignore شوند.

### ۶) Metro / Expo

- از SDK 52 به بعد پیکربندی monorepo خودکار است؛ **`watchFolders` و `nodeModulesPaths` دستی ننویسید** مگر مستندات برای نسخه‌ی شما صراحتاً بگوید.
- `metro.config.js` را با `getDefaultConfig` پیش‌فرض نگه دارید.
- پشتیبانی از `exports` در `package.json` (برای subpath exportهای `contracts`) در نسخه‌های جدید Expo به‌صورت پیش‌فرض فعال است؛ اگر `@jonoubpart/contracts/auth` resolve نشد، نسخه‌ی SDK و تنظیم `unstable_enablePackageExports` را بررسی کنید.
- بعد از هر تغییر ساختاری: `bunx expo start --clear`.

### ۷) Next.js (وب مشتری)

- `transpilePackages` برای پکیج‌های workspace که سورس TS می‌دهند الزامی است.
- برای بیلد standalone: `outputFileTracingRoot` روی ریشه‌ی ریپو.

### ۸) Android / Gradle

- autolinking اکسپو و RN مسیر `node_modules` را با `node` و resolution نسبت به پوشه‌ی اپ پیدا می‌کند؛ پس بعد از جابه‌جایی پوشه‌ها، مسیرهای نسبی ثابت‌نوشته‌شده در `settings.gradle`، `build.gradle` و پلاگین Gradle داخل `.tools` را بررسی کنید.
- اگر پوشه‌ی `android` از `prebuild` تولید می‌شود، بعد از ادغام یک بار `bunx expo prebuild --clean` (با آگاهی از اینکه تغییرات دستی را پاک می‌کند) یا حداقل `./gradlew clean` بزنید.
- مرورگر مخزن maven و تنظیمات میرور (مثل `maven.myket.ir`) داخل `clients/` بماند تا به api نشت نکند.
- `node` باید نصب باشد (گام ۰).

### ۹) WSL2

- ریپو و `node_modules` روی فایل‌سیستم لینوکس (`~/dev/...`) باشند؛ زیر `/mnt/c` هم کند است و هم symlinkهای store مشکل پیدا می‌کنند.
- `bun install` را فقط از داخل WSL بزنید، نه از Windows؛ باینری‌های native و symlinkها بین دو محیط قابل‌تعویض نیستند.
- ابزارهایی مثل `adb` که سمت Windows اجرا می‌شوند ربطی به محل `node_modules` ندارند، ولی مطمئن شوید مسیر خروجی APK از WSL قابل‌دسترس است.

### ۱۰) Docker و استقرار api

- context بیلد باید **ریشه‌ی ریپو** باشد، نه `api/`، چون `packages/contracts` بیرون از `api/` است.
- الگوی لایه‌ای: اول `package.json`ها و `bun.lock` را کپی و `bun install --frozen-lockfile` (برای کش لایه)، بعد سورس را کپی کنید.
- فقط workspaceهای موردنیاز api را نصب کنید (`--filter`) تا وابستگی‌های Expo وارد image نشود.
- `.dockerignore` شامل `**/node_modules`، `clients/` و فایل‌های غیرضروری باشد.

### ۱۱) CI cache

- cache دایرکتوری `~/.bun/install/cache`، نه خود `node_modules`.
- کلید cache بر اساس hash فایل `bun.lock`.

---

## ۱۱. نکات مهم و تله‌های رایج

1. **کد خطا در اسکیمای wire باید `string` باشد** (بخش ۶)؛ `z.enum` باعث می‌شود اپ قدیمی با کد جدید از کار بیفتد.
2. **فیلد required جدید در request شکننده است**؛ فقط optional/default.
3. **enum جدید در response** اپ قدیمی را می‌شکند اگر کلاینت strict پارس کند؛ تحمل‌پذیر بنویسید.
4. **JIT و ESM/CJS:** `contracts` سورس ESM می‌دهد؛ اگر بخشی از api با `type: commonjs` و `tsc` + Node اجرا می‌شود، تداخل ممکن است. با Bun runtime یا bundler مشکل حل می‌شود.
5. **`contracts` نباید `node:*` import کند** (Metro و مرورگر ندارند).
6. **barrel بزرگ نسازید:** `src/index.ts` فقط common؛ featureها با subpath.
7. **قرارداد ≠ جدول DB.** فیلدهای داخلی (هش رمز، شناسه‌های داخلی، فلگ‌های ادمین) هرگز در اسکیمای response نباشند. مدل response را صراحتاً بسازید.
8. **تاریخ‌ها و شناسه‌ها:** قالب را در قرارداد ثابت کنید (مثلاً ISO string برای تاریخ و string برای id یا مقادیر bigint)، چون JSON نوع `Date`/`bigint` ندارد.
9. **ورژن‌دهی API:** برای تغییر شکننده `/v2` یا force update؛ حداقل‌نسخه‌ی اپ را در سرور و اپ پیاده کنید.
10. **اپ‌های اندروید منتشرشده زنده می‌مانند.** قبل از هر تغییر قرارداد بپرسید: «اپ قدیمی با این پاسخ چه می‌کند؟»
11. **تست قرارداد در CI اجباری** (snapshot) تا تغییر ناخواسته‌ی شکننده رد شود.
12. **نسخه‌ی SDK اکسپو را قبل از تغییرات ساختاری ثابت نگه دارید**؛ ارتقای SDK و ادغام ریپو را هم‌زمان انجام ندهید.
13. **اسکریپت‌های ژنراتور موجود** (مثل ساخت ماژول‌های http/errors) را بعد از ادغام با مسیرهای جدید (پیشوند `api/`) سازگار کنید.
14. **قدم کوچک:** ابتدا یک feature (auth)، بعد بقیه. مهاجرت کامل در یک PR ممنوع.

## ۱۲. عیب‌یابی سریع

| علامت                                                        | علت محتمل                                 | اقدام                                                                                |
| ----------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| Metro: `Unable to resolve module @jonoubpart/contracts/...` | کش قدیمی یا `exports` یا linker           | `bunx expo start --clear`؛ مسیر subpath را در `exports` بررسی کنید؛ نصب مجدد از ریشه |
| Next.js: syntax error در فایل `.ts` پکیج                    | `transpilePackages` تنظیم نشده            | افزودن پکیج به `transpilePackages`                                                   |
| Nest: `ERR_UNKNOWN_FILE_EXTENSION` یا خطای import ESM       | اجرای سورس `.ts` ESM با Node/CJS          | اجرا با Bun، یا بیلد با bundler، یا پکیج build‌شده                                    |
| دو نسخه‌ی zod و خطاهای type عجیب                             | بدون catalog/overrides                    | یکی‌کردن نسخه، `bun why zod`، نصب تمیز                                                |
| بیلد Gradle: مسیر `node_modules` پیدا نمی‌شود                | مسیر نسبی بعد از جابه‌جایی                 | بررسی `settings.gradle`/پلاگین `.tools`، `prebuild --clean`، `gradlew clean`          |
| import غیرمجاز بدون خطا کار می‌کند                           | linker `hoisted` و phantom dependency     | `isolated` یا قانون lint برای وابستگی‌های اعلام‌نشده                                    |
| CI همه چیز را بیلد می‌کند                                    | path filter نادرست                        | تنظیم affected / فیلتر مسیر                                                          |
| workflow اجرا نمی‌شود                                        | `.github` داخل `api/` یا `clients/` مانده | انتقال به ریشه                                                                       |

## ۱۳. چک‌لیست تصمیم‌ها و تکمیل کار

### تصمیم‌ها

- [ ] یک ریپوی واحد با ریشه‌ی workspaces
- [ ] پکیج `@jonoubpart/contracts` با وابستگی فقط `zod`
- [ ] مدل JIT یا build‌شده (بسته به نحوه‌ی بیلد Nest)
- [ ] انتخاب لایه‌ی fetch کلاینت: ts-rest، zodios یا wrapper دست‌نویس
- [ ] قانون boundaries برای `contracts`
- [ ] envelope خطا و سیاست «فقط اضافه‌کردن کد» (با `code: z.string()` روی wire)
- [ ] تست snapshot قرارداد در CI
- [ ] تصمیم درباره‌ی Turborepo (اختیاری)
- [ ] انتخاب صریح linker (`isolated`/`hoisted`) در `bunfig.toml`
- [ ] catalog برای zod و typescript

### اجرا

- [ ] گام ۰: tag بکاپ و وضعیت سبز
- [ ] گام ۱: انتقال با تاریخچه، `.github` به ریشه
- [ ] گام ۲: `package.json`، `bunfig.toml`، `tsconfig.base.json`، `.gitignore`
- [ ] گام ۳: پاک‌سازی lockfile/`node_modules` و نصب یکپارچه؛ هر دو طرف بیلد می‌شوند
- [ ] گام ۴: `contracts` با feature اول
- [ ] گام ۵: pipe، exception filter و کنترلر Nest
- [ ] گام ۶: wrapper کلاینت، `transpilePackages` برای Next.js
- [ ] گام ۷: تست end-to-end و بیلد اندروید
- [ ] گام ۸: قانون boundaries
- [ ] گام ۹: CI affected
- [ ] گام ۱۰: تست snapshot
- [ ] گام ۱۱: مهاجرت تدریجی بقیه‌ی featureها
- [ ] گام ۱۲: OpenAPI (در صورت نیاز)
- [ ] آرشیو ریپوهای قدیمی پس از پایداری

</div>
