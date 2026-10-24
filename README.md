# 电路实验室

面向中学生的中文直流电路虚拟实验室。原生 HTML、CSS、JavaScript 和 SVG；网页版无需安装依赖，另提供 Electron 桌面版和 Capacitor Android 版，均内置网页资源，可离线使用。

在仓库目录运行 `npm run dev`，打开 http://127.0.0.1:4173/ 。`npm test` 检查电路求解、导线、保存及反馈，`npm run check` 检查全部 JavaScript 模块语法。

## 桌面版与 Android 版

以下命令在本 Git 仓库（`circuit-lab/`）执行。打包需要 Node.js 22.21.1 或以上，首次运行 `npm ci` 安装锁定版本的依赖。两端直接打包 `dist/` 的现有网页，无需运行本地服务器。`dist/` 是版本管理中的网页源码，请勿删除或加入忽略规则。

### Electron 桌面版

```powershell
npm ci
npm run desktop                # 开发启动
npm run test:desktop           # 验证开发版 Electron 的启动、重启恢复和导入导出
npm run test:desktop -- --packaged # 启动当前系统实际打包后的程序进行检查
npm run desktop:build:win      # Windows x64 安装程序与免安装程序
npm run desktop:build:mac -- --arm64 # 在 Apple Silicon macOS 上生成 DMG 和 ZIP
npm run desktop:build:mac -- --x64   # 在 Intel macOS 上生成 DMG 和 ZIP
npm run desktop:build:linux    # 在 Linux 上生成 x64 AppImage 和 DEB
```

输出目录为 `release/desktop/`：

- `CircuitLab-<版本>-windows-x64-setup.exe`：可选择安装位置的安装程序。
- `CircuitLab-<版本>-windows-x64-portable.exe`：免安装启动。
- `CircuitLab-<版本>-macos-<arm64或x64>.dmg` / `.zip`：对应架构的 macOS 应用。
- `CircuitLab-<版本>-linux-x64.AppImage` / `.deb`：Linux 免安装程序及 Debian/Ubuntu 安装包。

需要在对应系统上构建，GitHub Actions 会分别提供 Windows、macOS ARM64、macOS Intel 和 Ubuntu 环境，不需要本地 Mac 或 WSL。`npm run desktop:build` 使用当前系统默认目标，`npm run desktop:pack` 仅生成应用目录。图标由 Node 从 SVG 生成到已忽略的 `build/`，不依赖桌面环境。当前 Windows 未做商业代码签名；macOS 使用 ad-hoc 签名及适配权限，未经过 Apple 公证，首次打开可能受到系统安全提示限制。云端启动检查不代表通过 Gatekeeper 公证。后续配置 Windows 证书时先启用 `win.signExecutable`，Apple 证书则替换 `mac.identity` 并配置公证；见 [electron-builder 签名说明](https://www.electron.build/v26/docs/features/code-signing/)。

实验保存在 Electron 的用户数据目录中，与网页版的浏览器数据独立；升级程序不清空实验。网页版已有实验可先在设置中导出 JSON 备份，再在桌面版或 Android 版导入。导入使用系统文件选择器，导出使用系统保存对话框。桌面窗口禁止网页访问 Node.js，使用隔离与沙盒，通过固定本地协议加载内置文件。

### Android

安装 Android Studio、JDK 21、SDK Platform 36 及 SDK Build Tools 36.0.0，并在 SDK Manager 接受相关许可证。支持 Android 7.0（API 24）及以上，需使用更新的 Android System WebView。完整工具要求见 [Capacitor 官方环境说明](https://capacitorjs.com/docs/getting-started/environment-setup)。

```powershell
npm ci
npm run android:build          # 同步网页，构建可直接安装的 debug APK
npm run android:open           # 同步资源并在 Android Studio 中打开原生工程
npm run android:sync           # 仅同步网页和恢复 Gradle wrapper
npm run test:android           # 已启动模拟器或连接设备时，验证原生保存重载和文件导出
```

默认输出 `release/android/CircuitLab-<版本>-android-debug.apk`。首次构建会下载 Gradle、缺失的已授权 SDK 和 Maven 依赖，之后应用本身可完全离线运行。构建脚本自动查找常见位置的 SDK 和 JDK；也可设置 `ANDROID_HOME`、`JAVA_HOME`，或用 `CIRCUIT_LAB_JAVA_HOME` 单独指定打包用的 JDK。Gradle 8.14.3 可运行于 JDK 21–24；JDK 25 需要另装 JDK 21。

Android 原生代码位于 `android/`，实验保存于应用私有数据。系统返回键依次关闭对话框、取消接线、退出全屏或收起侧栏，最后将应用移至后台。导出实验及备份通过 Android 的「另存为」选择位置，无需存储权限；文件导入沿用系统文件选择器。应用隐藏时立即保存草稿。

正式 APK/AAB 使用自己的签名密钥。将以下环境变量设置为已有密钥库的信息（密钥库路径须为绝对路径），再运行 `npm run android:release` 或 `npm run android:bundle`：

| 环境变量 | 含义 |
| --- | --- |
| `ANDROID_KEYSTORE_FILE` | 密钥库绝对路径 |
| `ANDROID_KEYSTORE_PASSWORD` | 密钥库密码 |
| `ANDROID_KEY_ALIAS` | 密钥别名 |
| `ANDROID_KEY_PASSWORD` | 私钥密码 |

分别输出 `release/android/CircuitLab-<版本>-android-release.apk` 和 `CircuitLab-<版本>-android-release.aab`；未提供签名配置时会报错，不退回调试签名。`npm run android:ci` 一次执行 Release Lint、APK/AAB 构建及签名校验。版本名称取自 `package.json`，Android `versionCode` 使用 `主版本 × 10000 + 次版本 × 100 + 修订版本`（次版本、修订版本均须小于 100）。

Android 正式包与旧调试包的签名不同，首次切换请先在设置中导出实验备份，再卸载调试版、安装正式版并导入备份。之后的正式版本复用同一密钥，可覆盖升级保留数据。

### Git 与构建产物

只管理源码、文本配置和 `package-lock.json`。`release/`、`artifacts/`、`node_modules/`、Android 构建缓存、机器路径、签名密钥以及 EXE/APK/AAB/JAR/压缩包均已忽略。原生图标使用可提交的 SVG/XML；Gradle wrapper JAR 不提交，`android:sync` 和构建脚本会从 Gradle 官方仓库恢复并校验固定 SHA-256，Gradle 分发包也校验 SHA-256。克隆后先运行 `npm ci` 和 `npm run android:sync`，再从 Android Studio 构建。

## GitHub Actions 自动检查与发版

日常流程：修改源码 → 提交 PR 或推送 `main` → CI 检查 → 推送版本标签 → 自动构建并公开 [GitHub Release](https://github.com/az7627/circuit-lab/releases)。npm 发布暂缓，根包保持 `private: true`。

`CI` 工作流在 Windows x64、macOS ARM64/Intel、Ubuntu x64 上运行语法、单元测试及 Electron 启动检查。`Build and Release` 工作流在对应系统分别构建 Windows 安装版/免安装版、macOS 两种架构的 DMG/ZIP、Linux AppImage/DEB，并在 Ubuntu 使用 JDK 21、SDK 36 构建正式 Android APK/AAB、运行 Lint 和签名校验。桌面检查使用 Playwright 启动实际打包的程序，验证本地页面、14 种元件、沙盒、全屏、完整重启恢复、JSON 导入导出与窄屏布局。Linux 使用 Xvfb/Openbox 虚拟显示环境，保留沙盒。Android CI 不启动模拟器。

所有构建检查通过后，只读的附件校验任务会收齐 10 个安装包，检查文件名、完整性及非空内容；手动构建也执行此步骤。随后发布任务生成 `SHA256SUMS.txt`，先上传草稿再公开 Release。安装包仅作为 Actions 产物及 Release 附件保存，不进入 Git。构建任务只有读取权限，只有最终发布任务获得 `contents: write`；使用 GitHub 自动提供的令牌，无需手动配置 GitHub 发布 Token。官方 Actions 固定到提交 SHA。

### 后续发布一个新版本

工作区保持干净，在 `main` 上执行：

```powershell
npm version patch
git push origin main --follow-tags
```

`npm version` 自动同步包与锁文件版本、创建版本提交和 `vX.Y.Z` 标签；需要小版本/大版本时改为 `minor` / `major`。标签必须与两处版本一致，只接受稳定的数字版本，次版本和修订版本须小于 100，以保持 Android 版本号递增。

在 GitHub Actions 选择 `Build and Release` → `Run workflow` 可手动构建当前分支。手动运行只提供可下载产物，不创建或公开 Release。未通过时查看对应任务日志和 diagnostics 附件；修复源码后重新构建。网络或上传问题可重跑同一标签并补齐草稿；已经公开的版本和附件不会被覆盖，代码修复需要新版本号。诊断与临时产物保留 7 天，Release 附件长期保留。

### Android 发布密钥的首次接入与恢复

Windows 上已登录 GitHub CLI 后，可运行 `pwsh -File scripts/setup-android-signing.ps1`。脚本只在密钥不存在时生成固定 RSA 4096 位密钥，已有密钥会复用；默认备份位置为用户目录 `.android/circuit-lab-signing/`，位于仓库外且仅当前用户可访问。`credentials.dpapi.xml` 的密码由 Windows DPAPI 加密，仅原 Windows 用户可解密；迁移机器前应在原用户环境将密钥和密码备份至自己的安全存储。

脚本将以下内容写入仓库的 GitHub Actions Secrets，日志只显示名称及公开证书指纹：

| Secret | 用途 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | 固定发布密钥库内容 |
| `ANDROID_KEYSTORE_PASSWORD` | 密钥库密码 |
| `ANDROID_KEY_ALIAS` | 密钥别名 |
| `ANDROID_KEY_PASSWORD` | 私钥密码 |

CI 在 runner 临时目录恢复密钥，签名后删除临时文件。密钥或恢复文件丢失时不要重新生成替换已有正式签名，应从备份恢复。`npm run check:git` 在 CI 中阻止二进制、生成目录或密钥进入 Git 文件列表。

项目代码采用 [MIT 许可证](LICENSE)。

## 搭建与观察

- 画布顶部可在「电路图」和「实物图」之间切换。14 种元件均有实物外观，两种模式共用电路连接关系、参数与实时读数，分别保存元件位置、朝向和视角。首次从实物图转为电路图时，先合并导线连接的电气节点，再识别串联链、并联支路与电压表测量支路，重新排布符号。支持桥式结构与一般图的分层布局；连接关系变化时重新生成电路图，重复切换则恢复各自布局。
- 实物图使用自由导线：在导线工具下，点击接线端或节点，移动鼠标后再点击终点；也可按住接线端或节点拖到终点。导线沿鼠标轨迹绘制，落在空白处自动创建终点节点。导线工具下操作元件主体仍然是选择、移动，双击开关仍可切换状态。按 `Esc` 取消未完成的导线。
- 实物导线路径与电路图走线分别保留。拖动时用曲率传递、余量收紧和局部避障连续调整导线，接线端附近保持自然出线方向，避免逐帧整条重算。只调整与所移动元件或节点关联的电路；未接线元件和其他独立电路不会触发已有线路重排。在拖动预览中按“先减少交叉，再避开元件，最后兼顾原轨迹与长度”的顺序局部修复，松手直接保存最后一帧，不再重新布线。实物避障使用灯泡玻璃、底座等实际外形区域。手绘路径在切换模式和修改参数时保留。两种模式均可在导线上插入分支节点，交叉导线不会自动接通。当前模式、布局缓存及自由路径随草稿、实验、JSON 文件及备份保存，旧版自动转换布局会在下次互转时更新。
- 实物电表为三接线柱结构：左侧公共负端，中间为小量程正端，右侧为大量程正端。电流表量程为 0.6 / 3 A，电压表为 3 / 15 V，通过改接正接线柱切换；指针、刻度与实际读数使用同一量程，显示超量程和反接提示。电路图保留两个接线端，接入的小量程接线柱会映射到正端，两种模式的连接不变。
- 14 种元件：电源、小灯泡、电阻、开关、双掷开关、电流表、电压表、滑动变阻器、电动机、电铃、电热丝、电容、线圈、保险丝。
- 画布没有空间边界，拖动空白处平移，滚轮缩放。元件、节点、导线拐点及当前视角一起保存。新放置电源默认横向，负极在左、正极在右。电流表、电压表默认同样左负右正。选择元件不会改变视角。元件点击与选中框仅覆盖图形本体及少量边距，名称和参数文字不参与点击判定，方便在旁边放置节点与接线。
- 元件库上方的三种工具排成一行：选择用于选择和移动，导线用于放节点和接线，删除用于删除点击的目标。撤销与重做在下一行。添加元件后保留当前工具。
- 接线节点模式点击空白处放置节点，点击节点或元件接线端开始连线，再点击目标接线端结束。连线期间点击空白处创建终点节点并结束本次接线；再次点击起点即可连接下一段。点击导线插入分支节点。点击元件主体可以选择和移动，双击开关快速切换通断。双掷开关有公共端 C 和支路 1、2，双击切换接通的支路，也可在右侧属性选择；两个支路不会同时接通。
- 导线位于元件上方，可以选中及单独删除覆盖元件的导线。普通导线交叉不会自动接通，实心节点上的所有支路接通。
- 顶栏统一提供实验名称、视图切换、缩放、加载、导出、保存、全屏、帮助和设置。工作区填满窗口剩余空间，左上角按钮可以展开或收起实验侧边栏。全屏显示整个页面，保留顶栏、元件库、画布、实时测量及属性栏。
- 根据实际连接拓扑计算总电流、端电压、等效电阻和元件功率，检测开路与短路。支持多节电池，串联电压相加、反接相减，同电压电池并联分担电流；冲突的理想电源接法会提示检查。简单的两端电源组显示实际电压和干路电流，多组或多端电源分别测量。
- 灯泡明暗和电热丝红热程度随功率变化。电动机圈内 M 上叠加风扇，通电旋转，转速随功率变化，调节参数时保留当前转角，连续、平滑地改变速度。电铃通过 Web Audio 发声，音量随功率变化；断电停止，页面隐藏时静音。
- 电流方向显示可在设置中切换。模拟持续运行，无需暂停按钮。
- 操作帮助中可载入串联、并联和欧姆定律示例。实验数据记录面板已移除，旧文件中的记录仍保留以兼容导入与备份。

## 保存与管理实验

左侧只显示用户保存的实验。点击「保存实验」命名并加入列表，之后修改自动保存。侧栏可以新增、重命名、归档及删除实验；删除有二次确认，归档直接移至右上角设置中的「已归档实验」，可恢复。

顶栏提供「导出实验」和「加载实验」。单个实验使用 JSON 文件，包含完整电路、元件参数、开关状态、视角与布局缓存。加载文件时创建新的实验，同名内容自动标注「导入」，保留已有实验及草稿。双掷开关的 C、1、2 标记在各个旋转方向都保持正向。

实验保存在当前浏览器的本地存储中，不自动跨设备同步。在设置中导出 JSON 备份可保存全部实验、归档内容与草稿；导入时合并实验，不覆盖已有列表。未保存的草稿也会保留，可以在设置中恢复。浏览器存储空间不足时会提示导出备份。

旧 `circuit-lab-v1` 电路、蜂鸣器、变阻器及实验记录兼容升级；旧存储保留。新集合使用 `circuit-lab-experiments-v2`。每个实验最多 200 个元件、500 个节点、1000 根导线和 500 条测量记录，坐标没有画布边界。

快捷键：`V` 选择，`J` 接线节点，`E` 删除，`Ctrl+Z` 撤销，`Ctrl+Shift+Z` 或 `Ctrl+Y` 重做，`Ctrl+S` 保存，`F` 全屏，`Esc` 退出全屏或取消接线，`0` 适应画布。选择元件或节点后用方向键移动。

## 模型说明

实物图重画的思路参考 [OpenStax Physics 19.3 中的不规则电路重画例题](https://openstax.org/books/physics/pages/19-3-parallel-circuits)：先追踪连接节点及各条路径，再确定串并联关系，弯曲导线的外形不决定电路拓扑。布局和布线只改变几何，不改变端子、导线编号或求解模型。

使用理想直流电源、零电阻导线和电流表、无限电阻电压表。灯泡、电动机、电铃、电热丝以电阻近似；声音、动画及红热程度用于定性观察，不是实际声压、机械转速或温度计算。电表量程用于刻度、指针及超量程显示，电气模型仍为理想电表；不模拟电源内阻、表内电阻及暂态。

滑动变阻器下端连接电阻丝固定端，上端连接滑片，调节有效电阻时箭头移动、端子保持固定。电动机采用圈内 M 的符号，不标正负极。电铃采用向上半圆和两条引线的示意图形，参考科学出版社《学会电工识图的10堂课》1.12 节：[出版社原文](https://www.ecsponline.com/yz/BFC0B9B8DF9984E41B9ED007856D65E2F000.pdf)。

电容在稳态直流时断路，理想线圈在稳态直流时短路。保险丝冷态电阻 0.2 Ω，超过可调额定电流时熔断，可在属性栏更换。

部署文件位于 `dist/`，Sites 配置位于 `.openai/hosting.json`。
