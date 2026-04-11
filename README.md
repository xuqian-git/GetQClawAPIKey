# GetQClawAPIKey

一个本地 Node CLI 工具，用微信扫码登录 QClaw，并在终端直接打印可用的明文 `apiKey`。

它会在终端输出：

- ASCII 二维码
- 扫码和登录状态日志
- 明文 `apiKey`
- 可直接执行的 `curl` 示例

## Quick Start

```bash
npm install
npm start
```

运行后：

1. 用微信扫描终端里的 ASCII 二维码
2. 在微信里确认登录
3. 等待终端打印 `apiKey`

## 运行效果

下面是脱敏后的示例输出：

```text
> npm start

> get-qclaw-api-key@1.0.0 start
> node server.js

[23:45:49] 正在请求登录 state...
[23:45:49] 正在获取微信二维码页面...
[23:45:49] guid=<GUID>
[23:45:49] state=<STATE>
[23:45:49] 请使用微信扫描下面的二维码：
[23:45:49] 正在下载二维码图片，uuid=<UUID>

<ASCII QR CODE>

[23:45:50] 开始轮询扫码状态...
[23:46:15] 二维码已扫描，等待微信里点击允许...
[23:46:17] 微信确认完成，已拿到登录 code。
[23:46:17] 正在调用 4026 换取登录态...
[23:46:18] 4026 未返回完整 user_info，补调 4027...
[23:46:18] 登录成功，loginKey=no，jwt=yes，channelToken=yes。
[23:46:18] 正在调用 4055 获取 apiKey...
[23:46:18] 正在调用 4155 上报首次登录风控事件... deviceToken=guid
[23:46:19] 4155 调用成功。deviceToken=guid

[23:46:19] apiKey 获取成功。
sk-<REDACTED>
```

## API 用法

当前已验证可直接调用的聊天补全接口地址：

```text
https://mmgrcalltoken.3g.qq.com/aizone/v1/chat/completions
```

示例请求：

```bash
curl 'https://mmgrcalltoken.3g.qq.com/aizone/v1/chat/completions' \
  -H 'Authorization: Bearer <YOUR_API_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "modelroute",
    "messages": [
      { "role": "user", "content": "hi" }
    ],
    "max_tokens": 10000
  }'
```

接口是 OpenAI 兼容的 `chat/completions` 风格。

如果是在 OpenClaw 里配置 provider，`baseUrl` 应填写：

```text
https://mmgrcalltoken.3g.qq.com/aizone/v1
```

不要带 `/chat/completions`；OpenClaw 会自行拼接后续路径。

## 已验证模型

当前已验证可正常调用：

- `modelroute`（疑似 QClaw 默认模型，后台可动态切换）
- `deepseek-v3.2`

通过请求体里的 `model` 字段切换模型，例如：

```json
{
  "model": "deepseek-v3.2",
  "messages": [
    { "role": "user", "content": "你好" }
  ],
  "max_tokens": 10000
}
```

## 常见问题

### 二维码过期

重新运行脚本即可。

### 登录成功但接口仍不可用

在之前的版本，初登用户没有权限，新版脚本在会自动调用 `4155` 完成激活步骤。

### 想切换模型

修改请求体里的 `model` 字段即可。
