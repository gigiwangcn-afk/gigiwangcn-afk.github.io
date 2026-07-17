# Memory Frequency｜记忆频率

这不是播放器，而是一台“接收二十岁声音记忆的未来档案收音机”。旋转 Memory Frequency Ring，在噪声中靠近 87.6、94.3、101.8、106.4 MHz。散乱载波会逐渐按影像明暗聚合，形成扫描条带与波形图像，完全锁定后才恢复带有胶片颗粒的记忆色彩与环境声。

## 运行

页面使用 ES Modules，请在 `MemoryFrequency` 目录启动静态服务器：

```bash
node server.mjs
```

然后访问 `http://127.0.0.1:8080`。浏览器会阻止网页自动播放声音；第一次点击“启动接收”或旋转旋钮时，Web Audio 才会启动。推荐佩戴耳机。

## 替换图片

1. 把 JPG 或 PNG 放入 `assets/images/`。
2. 在 `main.js` 顶部 `memories` 数组中修改对应频道的 `image` 路径。
3. `MemoryReveal` 会自动从照片采样亮度，并生成载波错位、扫描条带、波形聚合和色彩恢复。
4. 如果素材本身不适合在锁定后直接显示，可加入 `signalOnly: true`，最终画面将以波形重建为主，只保留极弱的原图底层。

## 添加新的声音频道

复制 `main.js` 中一个频道对象，修改唯一的 `id`、`frequency`、文字和图片。`audio.type` 可用：

- `park`：树叶与远处环境声
- `silent`：该频道不播放记忆声音
- `desk`：室内细碎高频
- `chimes`：风声与缓慢金属泛音

频道达到约 88% 清晰度时会触发一次对应声音，锁定期间不会循环：MP3 频道是一小段轻柔纯音乐；公交频道保持静音；猫咪频道使用真实猫叫；风铃频道是一组带衰减余韵的金属碰撞。调离频道后声音会淡出；重新找到频道时可再次触发一次。

若使用一条真实录音，可在 `assets/audio/` 放置 MP3、WAV 或 OGG，并设置 `audio.url`。需要混合多条录音时，使用 `audio.tracks`，每条可设置 `url`、`gain`、`offset` 和 `duration`；录音只播放一次，不会循环，并会在调离频道时淡出。

### 音频素材来源

- `cat-meow.ogg`：IgnasD，OpenGameArt，CC0。

## 文件结构

```text
MemoryFrequency/
├── index.html
├── style.css
├── main.js
├── server.mjs
├── README.md
├── assets/
│   ├── audio/
│   │   └── cat-meow.ogg
│   └── images/
│       ├── memory-park.jpg
│       ├── memory-bus.jpg
│       ├── memory-cat.png
│       └── memory-chimes.jpg
└── modules/
    ├── RadioDial.js
    ├── SignalNoise.js
    ├── Waveform.js
    ├── MemoryReveal.js
    └── AudioController.js
```

模块职责：`RadioDial` 处理阻尼旋转与键盘/滚轮输入，`SignalNoise` 生成模拟干扰，`Waveform` 绘制实时接收波形，`MemoryReveal` 负责载波聚合与照片恢复，`AudioController` 负责噪声、四类环境声与低通滤波。
