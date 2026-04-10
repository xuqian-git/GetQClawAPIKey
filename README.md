# GetQClawAPIKey

一个本地 Node CLI 工具，用微信扫码登录 QClaw，在终端输出 ASCII 二维码、实时日志，并在回调后打印可直接使用的明文 `apiKey`。

## 前置条件

必须先在 QClaw 客户端里完成账号注册和首次登录；没有注册过账号时，接口无法使用。

## 启动

```bash
npm install
node server.js
```

## 功能

- 在终端输出可扫描的 ASCII 微信登录二维码
- 轮询扫码状态并打印实时日志
- 获取明文 `apiKey`
- 在终端打印可直接执行的 `curl` 测试命令

## API 服务地址

当前已验证可直接调用的聊天补全接口地址：

```text
https://mmgrcalltoken.3g.qq.com/aizone/v1/chat/completions
```

请求方式：

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

这是openai兼容协议，如果是在 OpenClaw 里配置 provider，`baseUrl` 应填写：

```text
https://mmgrcalltoken.3g.qq.com/aizone/v1
```

不要写成带 `/chat/completions` 的完整请求地址；OpenClaw 会自行拼接后续路径。

## 可调用模型

基于当前实测，下面这些模型已验证可以正常调用：

- `modelroute`
- `deepseek-v3.2`

模型通过请求体里的 `model` 字段指定，例如：

```json
{
  "model": "deepseek-v3.2",
  "messages": [
    { "role": "user", "content": "你好" }
  ],
  "max_tokens": 10000
}
```
