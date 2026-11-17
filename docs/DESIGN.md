---
version: "1.0"
name: "局域网快传"
description: "基于用户已确认效果稿的桌面端前端设计规范，供 React 实现与界面验收使用。"
colors:
  page: "#F5F7FB"
  panel: "#FFFFFF"
  ink: "#1C2940"
  textSecondary: "#5C6B82"
  disabled: "#718097"
  line: "#E6EBF3"
  controlBorder: "#7F8DA3"
  primary: "#3268E9"
  primaryHover: "#2458D2"
  primarySoft: "#EDF3FF"
  selectedBorder: "#D5E2FF"
  surfaceQuiet: "#FBFCFF"
  dropBorder: "#CFDAF0"
  success: "#168560"
  warning: "#A96C18"
  warningText: "#88530A"
  danger: "#C34E53"
  focusHalo: "#9DBBFF"
  progressTrack: "#EAF0FA"
  fileZip: "#9470CD"
  fileZipBg: "#F3EFFA"
  filePdf: "#C18840"
  filePdfBg: "#FBF3E8"
  toast: "#233047"
fontFamilies:
  ui: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
typography:
  pageTitle:
    fontFamily: "{fontFamilies.ui}"
    fontSize: "25px"
    fontWeight: "650"
    lineHeight: "1.4"
  incomingTitle:
    fontFamily: "{fontFamilies.ui}"
    fontSize: "22px"
    fontWeight: "600"
    lineHeight: "1.6"
  taskTitle:
    fontFamily: "{fontFamilies.ui}"
    fontSize: "20px"
    fontWeight: "600"
    lineHeight: "1.5"
  brand:
    fontFamily: "{fontFamilies.ui}"
    fontSize: "19px"
    fontWeight: "700"
    lineHeight: "1.6"
  dialogTitle:
    fontFamily: "{fontFamilies.ui}"
    fontSize: "17px"
    fontWeight: "600"
    lineHeight: "1.6"
  sectionTitle:
    fontFamily: "{fontFamilies.ui}"
    fontSize: "13px"
    fontWeight: "600"
    lineHeight: "1.6"
  body:
    fontFamily: "{fontFamilies.ui}"
    fontSize: "14px"
    fontWeight: "400"
    lineHeight: "1.6"
  control:
    fontFamily: "{fontFamilies.ui}"
    fontSize: "14px"
    fontWeight: "500"
    lineHeight: "1.6"
  label:
    fontFamily: "{fontFamilies.ui}"
    fontSize: "12px"
    fontWeight: "500"
    lineHeight: "1.6"
  caption:
    fontFamily: "{fontFamilies.ui}"
    fontSize: "11px"
    fontWeight: "400"
    lineHeight: "1.6"
  micro:
    fontFamily: "{fontFamilies.ui}"
    fontSize: "10px"
    fontWeight: "600"
    lineHeight: "1.3"
  metric:
    fontFamily: "{fontFamilies.ui}"
    fontSize: "35px"
    fontWeight: "650"
    lineHeight: "1.3"
  pairingCode:
    fontFamily: "{fontFamilies.ui}"
    fontSize: "24px"
    fontWeight: "650"
    lineHeight: "1.6"
rounded:
  small: "6px"
  control: "8px"
  toast: "9px"
  item: "10px"
  brand: "11px"
  panel: "12px"
  dialog: "15px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  panelInline: "26px"
  section: "32px"
  frame: "36px"
  roomy: "40px"
layout:
  maxWidth: "1380px"
  sidebarWidth: "252px"
  sidebarCompactWidth: "230px"
  columnGap: "32px"
  compactGap: "22px"
  wideGap: "40px"
  headerHeight: "80px"
  compactHeaderHeight: "72px"
  queueVisibleRows: "5"
  fileColumns: "minmax(0, 1fr) 90px 100px 44px"
  fileCompactColumns: "minmax(0, 1fr) 70px 80px 44px"
breakpoints:
  wideMin: "1500px"
  compactMax: "1100px"
  stackedMax: "820px"
  narrowMax: "540px"
shadows:
  panel: "0 5px 20px #20345B05"
  dialog: "0 20px 90px #1B2B4B26"
  toast: "0 5px 20px #1A2C4E1C"
overlays:
  modalBackdrop: "#1C294047"
  modalBackdropBlur: "3px"
motion:
  interaction: "150ms"
  progress: "250ms"
  spinner: "800ms"
components:
  panel:
    background: "{colors.panel}"
    border: "{colors.line}"
    radius: "{rounded.panel}"
    shadow: "{shadows.panel}"
  primaryButton:
    minHeight: "44px"
    paddingInline: "{spacing.md}"
    radius: "{rounded.control}"
    background: "{colors.primary}"
    hoverBackground: "{colors.primaryHover}"
    foreground: "{colors.panel}"
    typography: "{typography.control}"
  secondaryButton:
    minHeight: "44px"
    radius: "{rounded.control}"
    background: "{colors.panel}"
    foreground: "{colors.ink}"
    border: "{colors.line}"
  softButton:
    minHeight: "44px"
    radius: "{rounded.control}"
    background: "{colors.primarySoft}"
    foreground: "{colors.primaryHover}"
  iconButton:
    minWidth: "44px"
    minHeight: "44px"
    iconSize: "20px"
    radius: "{rounded.control}"
    foreground: "{colors.textSecondary}"
  input:
    minHeight: "48px"
    padding: "10px 13px"
    radius: "{rounded.control}"
    border: "{colors.controlBorder}"
    foreground: "{colors.ink}"
  focusRing:
    width: "3px"
    offset: "3px"
    color: "{colors.primaryHover}"
  deviceCard:
    minHeight: "78px"
    compactMinHeight: "70px"
    padding: "13px 12px"
    radius: "{rounded.item}"
    selectedBackground: "{colors.primarySoft}"
    selectedBorder: "{colors.selectedBorder}"
    selectedIndicator: "{colors.primary}"
  dropzone:
    padding: "27px 20px 22px"
    widePadding: "35px 20px 31px"
    borderWidth: "1.5px"
    borderStyle: "dashed"
    borderColor: "{colors.dropBorder}"
    radius: "{rounded.item}"
    background: "{colors.surfaceQuiet}"
    draggingBackground: "{colors.primarySoft}"
  fileRow:
    minHeight: "64px"
    wideMinHeight: "79px"
    gap: "{spacing.sm}"
    typography: "{typography.label}"
  progress:
    height: "6px"
    fill: "{colors.primary}"
    track: "{colors.progressTrack}"
    radius: "{rounded.small}"
  dialog:
    width: "440px"
    maxWidth: "calc(100vw - 40px)"
    paddingInline: "{spacing.xl}"
    radius: "{rounded.dialog}"
    shadow: "{shadows.dialog}"
  toast:
    bottom: "30px"
    padding: "12px 20px"
    radius: "{rounded.toast}"
    background: "{colors.toast}"
    foreground: "{colors.panel}"
    shadow: "{shadows.toast}"
---

# 局域网快传前端设计规范

## Overview

本规范供前端开发与界面验收使用。用户已确认当前效果稿的视觉与主要交互，正式页面沿用浅灰背景、白色面板、蓝色主操作，以及“左侧找设备、右侧处理文件”的单页布局。

取值来源为已确认效果稿，归档见[设计基线原型](design/prototype.html)。原型用于保留视觉与交互参照，正式前端以本文的 token 与规则为准。本文约定正式 React 页面的实现要求；原型中的模拟传输、保存和续传不作为真实能力或验收证据。

### 适用范围与优先关系

- 首版面向电脑端 Chromium 内核浏览器。按内核与必要接口检测，不按 Chrome、Edge 品牌限制使用；窄窗口适配不扩大手机、平板支持范围。
- 视觉数值以 frontmatter token 为准，默认值对应普通桌面布局，响应式覆盖见 Layout；组件和交互按正文执行。实现中用统一样式变量或主题映射消费这些 token，避免在组件里散落近似值。
- 产品范围、保存授权、状态机和恢复边界以[产品与技术方案](plans/active/20261117-browser-lan-file-transfer.md)为准，尤其是第 12、13 节。本文不重新定义网络协议或错误码。
- 后续调整视觉约定时同步修改 token 与正文；涉及产品范围或授权语义时先核对技术方案，不能只改界面绕过约束。

### 效果稿与正式产品的区别

| 保留或落实 | 正式实现的处理 |
| --- | --- |
| 布局、主要尺寸、蓝白配色、线性图标、轻量面板 | 按本规范迁入 React，不另起一套视觉风格 |
| 设备名、配对码、连接状态、文件和进度 | 全部取自用户输入或真实运行状态；没有数据时显示空态或等待态 |
| “发送演示 / 接收演示”、下一阶段、模拟异常、重置场景、效果稿标记 | 属于评审工具，不进入正式产品 |
| 原型中的模拟文件夹选择窗口 | 正式版调用系统保存或目录选择器；网页只解释权限、展示选择结果 |
| 对比度、长队列、单位标注及键盘行为 | 按本文补齐；这些是原型正式化的细节，不改变已确认的布局与主色 |

## Colors

白色面板承载文件、接收请求和当前任务。页面浅灰只作背景；蓝色用于主要操作、选中和正在处理的状态，绿色用于已确认成功，红色用于失败或破坏性操作。

| Token | 色值 | 用途与限制 |
| --- | --- | --- |
| `colors.page` | `#F5F7FB` | 全页背景 |
| `colors.panel` | `#FFFFFF` | 面板、弹窗、主按钮文字 |
| `colors.ink` | `#1C2940` | 标题、主要内容、明确结果 |
| `colors.textSecondary` | `#5C6B82` | 正常可读的说明、文件大小、状态辅助信息 |
| `colors.disabled` | `#718097` | 禁用控件及装饰；不用于正常阅读的说明文字 |
| `colors.line` | `#E6EBF3` | 卡片边缘和分隔线，不单独承担输入框或状态识别 |
| `colors.controlBorder` | `#7F8DA3` | 需要依靠边界识别的输入框等控件 |
| `colors.primary` | `#3268E9` | 主按钮填充、进度填充、选中图标 |
| `colors.primaryHover` | `#2458D2` | 主按钮悬停、链接、浅蓝底按钮文字、键盘焦点 |
| `colors.primarySoft` | `#EDF3FF` | 选中设备、轻操作、拖拽命中区域的浅底色 |
| `colors.selectedBorder` | `#D5E2FF` | 设备选中态的辅助边框，须同时有选中标记 |
| `colors.surfaceQuiet` | `#FBFCFF` | 文件拖拽区的安静底色 |
| `colors.dropBorder` | `#CFDAF0` | 拖拽区的装饰性虚线；主要选择操作由可访问按钮提供 |
| `colors.success` | `#168560` | 白底上的完成标记和成功文字 |
| `colors.warning` | `#A96C18` | 提醒图标；小字号正文改用 `warningText` |
| `colors.warningText` | `#88530A` | 需要注意但尚未失败的可读提示 |
| `colors.danger` | `#C34E53` | 白底上的错误文字、失败标记、取消类操作 |
| `colors.progressTrack` | `#EAF0FA` | 传输进度轨道 |
| `colors.fileZip` / `fileZipBg` | `#9470CD` / `#F3EFFA` | 压缩包的装饰性文件图标 |
| `colors.filePdf` / `filePdfBg` | `#C18840` / `#FBF3E8` | PDF 的装饰性文件图标 |
| `colors.toast` | `#233047` | 短暂反馈浮层，搭配白字 |

### 对比度与状态表达

本项目以普通文字与背景至少 **4.5:1**、承担识别作用的控件边界和图形至少 **3:1** 作为最低验收目标。禁用状态可弱化，但失败、取消和已结束等结果仍须正常可读，不能把整行一起降透明度。

原型的 `#718097` 在白底上约为 4.01:1，因此正常辅助文字统一使用 `textSecondary`，白底约为 5.41:1。`textSecondary`、`controlBorder`、`warningText` 是正式实现的补充 token；焦点和浅蓝底动作文字复用原型已有的深蓝 `primaryHover`。

- 主按钮为蓝底白字。浅蓝底按钮使用 `primaryHover` 文字，避免直接将 `primary` 小字放在 `primarySoft` 上。
- `success`、`danger` 小字限定在已核验对比度的白底上；在页面灰底或其他背景上可用 `ink` 文字加相应颜色图标。新增组合须重新检查。
- `line` 和 `selectedBorder` 可以作装饰性边界；实际输入控件不能仅靠这类浅线条识别。普通次按钮的文字和按钮外形须足以识别操作，必要边界改用 `controlBorder`。
- 状态始终配文字，必要时配图标。不能只用红绿圆点区分成功、失败、暂停或在线情况。
- `focusHalo` 仅作可选浅色外晕，不能替代 `components.focusRing` 的深蓝实线。

## Typography

统一使用系统字体栈 `fontFamilies.ui`，不依赖外部字体下载。中文与英文混排保持同一字体体系。

| 角色 | 字号 / 字重 / 行高 | 使用位置 |
| --- | --- | --- |
| `pageTitle` | 25px / 650 / 1.4 | 工作区主标题；紧凑桌面下 23px |
| `incomingTitle` | 22px / 600 / 1.6 | 接收请求标题 |
| `taskTitle` | 20px / 600 / 1.5 | 当前任务阶段 |
| `brand` | 19px / 700 / 1.6 | “局域网快传”品牌文字 |
| `dialogTitle` | 17px / 600 / 1.6 | 配对、改名、确认窗口标题 |
| `sectionTitle` | 13px / 600 / 1.6 | 文件队列等分区标题 |
| `body` / `control` | 14px / 400 或 500 / 1.6 | 主正文、主要操作 |
| `label` | 12px / 500 / 1.6 | 文件名、表单标签、次级操作 |
| `caption` | 11px / 400 / 1.6 | 文件大小、类型、补充说明和紧凑状态 |
| `micro` | 10px / 600 / 1.3 | 品牌英文副标等装饰性信息 |
| `metric` | 35px / 650 / 1.3 | 当前传输百分比或阶段主指标 |
| `pairingCode` | 24px / 650 / 1.6 | 本机配对码 |

关键错误、保存授权、最终结果不能使用 `micro`。文件名至少按 `label` 显示，文件类型和大小至少按 `caption` 显示。说明可换行，不通过持续缩小字号解决拥挤。

配对码、文件大小、速度、百分比与已用时间使用 `font-variant-numeric: tabular-nums`，减少数字变化带来的抖动。静态配对码字距 2px；输入中的配对码可按原型使用 5px 字距。页面标题字距 -0.4px、任务标题 -0.3px、主指标 -1px；不扩散到普通正文。

### 数字与单位

- 本项目按 1024 换算文件容量，使用 `B`、`KiB`、`MiB`、`GiB`；速度使用 `KiB/s` 或 `MiB/s`。二进制换算后不继续标成 MB、GB，不混淆字节与比特。
- 单位与数字间留一个空格；容量和速度通常最多保留两位小数，同列采用一致精度。传输百分比通常显示整数并向下取整，确认字节未达到总量时不四舍五入到 100%；确认数据传完后及时切换后续真实阶段，显示值不代替实际完成条件。
- 文件大小为零时显示 `0 B`。进度计算避免除零，仍须等待实际保存结果，不能因此直接认定完成。
- 10G 是必须验证的能力目标，不是界面文件大小上限；不写“最大 10 GB”。10 GB 与 10 GiB 的验收口径见技术方案。
- 剩余时间只在有可靠运行数据时显示估计值；尚不可估计则显示“正在计算”或省略，不给固定倒计时。

## Layout

### 页面骨架

主容器水平居中，`max-width: 1380px`，包含自身内边距，统一使用 `box-sizing: border-box`。顶部品牌栏与正文共享左右对齐线。

| 区域 | 基准尺寸与职责 |
| --- | --- |
| 顶栏 | 高 80px；品牌在左，服务状态和使用帮助在右；不承担产品功能导航 |
| 主体 | 默认内边距 `32px 36px 20px`，双栏间距 32px |
| 左栏 | 宽 252px；本机信息、临时设备名、配对码、候选设备和发现说明 |
| 右栏 | `minmax(0, 1fr)`；选择文件、查看接收请求、当前任务及文件队列 |
| 本机卡片 | 内边距 20px，设备区与卡片相隔 28px |
| 传输面板 | 目标设备栏、文件选择或当前任务、队列、底部操作连续排列 |
| 面板横向内容 | 默认 26px；紧凑桌面收为 20px |
| 面板底栏 | 默认 `20px 26px`，与内容区同一对齐线，不用空白撑开布局 |

保持单页工作区。接收请求由真实事件进入当前工作区，发送操作由用户选择设备和文件进入；不保留“发送演示 / 接收演示”模式开关，也不为两种方向另造一套视觉布局。

同一标签页同时只有一个活动文件。活动批次中的目标和清单保持稳定；其他请求按技术方案显示忙碌或等待，不覆盖当前任务。

### 响应式规则

| 视口宽度 | 布局规则 |
| --- | --- |
| 大于 1100px、低于 1500px | 默认 252px 左栏、32px 间距、36px 页面横向内边距 |
| 至少 1500px | 容器仍不超过 1380px；主体上边距 42px、双栏间距 40px；标题下间距 28px；拖拽区内边距 `35px 20px 31px`；文件行最小 79px |
| 不大于 1100px | 左栏 230px、双栏间距 22px；主体内边距 `26px 24px`；主标题 23px；文件表收紧列宽 |
| 不大于 820px | 主体改为单列、内边距 `22px 20px`；顶部设备区内部仍可按 230px 与剩余空间并排；顶栏高 72px |
| 不大于 540px | 设备区内部也改为单列；允许隐藏文件大小等重复辅助信息，保留文件名、状态和操作；仅作极窄窗口容错 |

正式验收重点为 1440×1000、1280×900、1024×900。780×1050 用于检查窄桌面窗口容错，不据此宣称支持移动设备。大缩放和窄窗口下允许页面纵向滚动，不得出现横向溢出、遮住主操作或让弹窗按钮不可达。

### 文件列表与长内容

- 默认文件行高至少 64px，四列为 `文件 1fr / 大小 90px / 状态 100px / 操作 44px`，列间距 12px。1100px 以下改为 `1fr / 70px / 80px / 44px`，间距 8px。
- 长文件名和设备名在显示层单行末尾省略，完整文本仍保留在可访问名称中；悬停或键盘聚焦相应行内控件时可查看完整名称。名称区域使用 `min-width: 0`，不挤走状态和操作。
- 原型只展示少量文件。正式版列表的最大高度取当前行高的 5 倍与 40vh 中较小者，支持动态视口单位时用 40dvh；超出后在列表内滚动，保持队列标题与底部操作可见。滚动区须可用键盘操作并有可访问名称，不改变默认三行场景的外观。
- 保持当前活动行可见，但不持续抢夺用户主动滚动的位置。状态变化不随意重排文件，清单保持确认时的顺序。
- 弹窗高度限制在可视区域内，长内容在弹窗内部滚动，标题、关闭和确认操作可达。

## Elevation & Depth

页面只保留清楚的层级，不使用重阴影、玻璃背景或大面积渐变。

| 层级 | 规则 |
| --- | --- |
| 页面背景 | `colors.page`，无阴影 |
| 普通面板 | 1px `colors.line` 边框与 `shadows.panel`；白底已能区分层级 |
| 选中与悬停 | 用浅底色、边框、选中标记反馈，不让卡片悬浮或放大 |
| 模态窗口 | 使用 `shadows.dialog`、`overlays.modalBackdrop`，背景模糊 3px |
| Toast | 使用 `shadows.toast`；位于弹窗之上、不能挡住关键操作；对应原型层级 50 |

DOM 层级优先采用原生对话框的顶层机制，避免用不断增大的 `z-index` 解决叠放。Toast 的层级实现须与实际对话框机制协调，不能假设普通 `z-index: 50` 能覆盖原生对话框顶层。

## Shapes

- 面板圆角 12px，按钮和输入框 8px，设备项和拖拽区域 10px，弹窗 15px，Toast 9px；完整值见 `rounded`。不把所有元素统一改成大胶囊形。
- 品牌图标容器为 40×40px、圆角 11px；设备头像一般 42×42px，目标设备栏内为 38×38px。文件图标容器为 36×42px、圆角 7px。
- 交互命中区域至少 44×44px；输入框最小高 48px。图标本身可以更小，删除、复制和改名按钮仍须保留完整命中区域。
- 复用原型的 SVG 线性图标：常规 20px、辅助 17px、主引导 26px，线宽 1.7，圆角端点；品牌图标线宽 2 为既有例外。不用 emoji 或不同风格的图标混搭。
- 主要间距来自 `spacing`。原型有 22、26、36、42px 等区域尺寸，按布局规则保留，不为凑整机械归并为另一套网格。

## Components

### 按钮、输入与焦点

| 类型 | 使用规则 |
| --- | --- |
| 主按钮 | 每个当前操作区一个主要动作，如“发送文件”“接收整批并选择文件夹”；使用 `primaryButton` |
| 普通次按钮 | 返回、关闭、稍后处理等；白底深字，不能与主操作争抢视觉权重 |
| 浅蓝或文字按钮 | 选择文件、查看可选操作等；使用深蓝动作文字 |
| 危险操作 | 取消、拒收等使用明确动词；删除图标需说明作用范围，不能只写“确定” |
| 图标按钮 | 复制、改名、移除等；必须有 `aria-label`，不能只靠图标形状或鼠标提示 |
| 输入框 | 独立可见标签，不以 placeholder 代替标签；错误说明紧邻输入并建立描述关联 |
| 键盘焦点 | 3px 深蓝实线，外移 3px；不能删除焦点轮廓；被容器裁剪时调整布局而非隐藏轮廓 |

悬停反馈采用背景或边框变化，过渡 150ms；按下可沿用原型的 1px 下移。禁用操作应有可理解原因，只有请求确实不允许时才禁用；不能靠用户点击后猜测当前是否可用。

对话框打开后焦点进入窗口，Tab 在窗口内移动，关闭后返回触发控件；Escape 与取消保持一致。因阶段切换移除了当前焦点控件时，将焦点移至同一区域合理的后继位置并播报阶段，不抢到页面顶部。

### 本机与设备列表

- 本机卡片展示临时设备名、实际在线状态、配对码、复制和改名入口。设备改名不意味着创建账号或永久身份。
- 列表标题固定为“可发现的设备”，不使用“附近设备”暗示物理位置。同公网出口只产生候选分组，不能作为身份或局域网证明。
- 设备项默认至少 78px 高，820px 以下可收为 70px；以按钮承载选择，支持 Enter、Space，并用 `aria-pressed` 表达选中状态。选中同时表现为浅蓝底和选中图标。
- 选中勾表示“已选择”，不表示“身份已验证”。设备名与文件名均按不可信纯文本渲染，不解释为 HTML。
- 在线、已配对、正在连接、已直连分别取自相应真实状态。仅出现在列表中时不能宣称“可直连”；只有建链成功后才显示“已连接”。
- 候选为空时保留配对码入口，提示“让对方也打开此页面，或输入对方配对码”。发现服务暂时离线时说明影响，不把仍在运行的直传任务一并判为断开。

### 配对码与配对窗口

配对码按当前工程默认展示为 8 位数字、4+4 分组，例如 `0000 1234`，作为字符串保存并保留前导零。输入使用文本框与数字键盘提示，允许粘贴后清理展示空格；有效位数、有效期和重试限制与服务端契约一致，不在组件中另写一套生命周期。

复制成功给短暂反馈；剪贴板不可用时允许选中文字复制。过期、连接中和尝试受限要有明确状态，只有服务端提供可靠时间时才展示到期或重试倒计时。

配对只定位并连接候选设备，不能代替文件接收确认。按钮使用“连接”，不把演示中的“连接演示设备”或固定示例码带入正式页面。不提供二维码入口。

### 选择文件与发送草稿

- 保留 1.5px 虚线、浅底的拖拽区域和明确的“选择文件”按钮；拖入时边框变为 `primary`，底色变为 `primarySoft`。拖拽是快捷方式，键盘用户可以完成全部操作。
- 只支持文件，不接受发送文件夹或重建目录树；拖入目录时说明范围，不把它静默展开。
- 清单在发送前可增删，展示数量、总大小、单项名称和大小。缺少目标或文件时，说明下一步并禁用发送。
- 邀请发出后清单锁定。新增或替换文件按新清单重新确认，不能借现有目录权限悄悄增加接收项。
- 接收请求显示来源设备、完整批次清单和总大小。长清单可滚动查看，不能只展示第一项就要求同意整批。

### 保存位置与整批接收

| 场景 | 界面与操作 |
| --- | --- |
| 单文件 | “接收并选择保存位置”；由用户操作触发系统保存选择器 |
| 多文件 | “接收整批并选择文件夹”；一次确认当前整批清单，一次选择并授权目录，随后依次保存 |
| 取消系统选择器 | 返回等待接收，保留清单；不当作授权成功，也不强制认定已拒收 |
| 不支持所需保存能力 | 说明浏览器或运行环境不支持；不能静默改成逐文件弹窗 |
| 目录权限失效 | 暂停队列并显示“需要重新授权文件夹”，提供用户主动触发的授权按钮 |
| 同名文件 | 整批接收自动加后缀保留原件；单文件在系统窗口明确选择覆盖时遵循该选择；结果显示实际保存名 |

选择接收文件夹只确定保存位置，不表示支持文件夹传输。网页不得读取或上传授权目录中的无关文件；接收路径只在本机展示，不发给对方。重新授权核对原目录，不能未经说明将剩余文件改存其他位置。

### 当前任务、队列与结果

任务面板展示当前文件、批次位置、真实阶段和当前可用操作。队列同时标出“当前文件第 n/N 项”和“已保存 n/N 个文件”，二者不能互相替代。

| 阶段 | 主指标与说明 | 可用操作及边界 |
| --- | --- | --- |
| 等待接收 / 连接中 | 文字状态与必要活动指示；无传输百分比 | 可取消请求；接收方完成清单及保存授权后才进入传输 |
| 传输中 | 百分比、已确认字节、速度；有依据时显示估计剩余时间 | 暂停、取消当前文件或结束队列；百分比按接收端确认量计算 |
| 正在暂停 / 已暂停 | “正在暂停”或“已暂停”，冻结传输进度 | 双方暂停条件都解除后才继续；不能点击本地继续就宣称对端已恢复 |
| 重连中 | 具体原因、活动指示和已用时间；不显示虚假进展 | 恢复成功后继续；条件失效时说明需要重新开始 |
| 校验中 | “校验中”及阶段已用时间 | 仅在确有可计数工作时显示处理量，不人为延长阶段 |
| 保存中 | “保存中”及阶段已用时间，不继续挂着 100% | 不提供无效的继续按钮；提交已开始且不能可靠中止时，批次动作明确为“保存后停止” |
| 等待确认 | 发送方显示“等待对方保存确认”；接收方已保存则显示本地确定结果 | 查询已有结果；不能盲目重传或再次创建文件 |
| 已完成 | 显示“已保存”或“对方已保存”和完成标记 | 结果确定后才更新已保存计数并自动处理下一项 |
| 失败 / 已取消 / 已拒收 | 各自明确终态、原因和适用的下一步 | 不归并为成功；只提供确实可执行的重试或继续剩余项 |

传输进度轨道高 6px，填充过渡 250ms。无可用百分比的阶段使用活动指示与已用时间，不显示循环增长到 99% 的假进度；读取或发送完正文不等于保存完成。

超过建议的 15 秒仍在保存时，增加“仍在保存文件，请保持页面打开”。这只是解释阈值，不是失败超时；未得到实际结果时继续等待或确认结果，不报成功、删除文件或强制重传。

取消默认作用于当前文件，保留后续队列并暂停推进；可另行结束整批。用户应能区分“取消当前文件”“结束整个队列”和保存提交中的“保存后停止”。迟到的取消不能把实际已保存文件显示成已撤回，也不能自动删除已保存文件。

整批只有全部文件提交成功才能显示“全部已保存”或成功的 100%。部分失败或取消后，以“部分完成”或“已结束”收口，并分别列出已保存、失败、取消、拒收数量。不能留着一个不足 100% 的活动进度条暗示任务仍在进行。

### 提示、错误与长时间操作

- Toast 用于“配对码已复制”“设备名已修改”等短暂、非关键反馈；授权失败、磁盘空间不足和保存结果未确认保留在对应任务区域，不靠几秒后消失的消息承载。
- 错误说明包含发生了什么、当前文件或队列受到什么影响、下一步可以做什么。已知的网络不可达、权限失效、磁盘满和对方拒收不要统一写成“操作失败”。
- 未确认的对端结果显示“对端保存结果未确认”；刷新或关闭页面会破坏当前续传条件，相关提示应在用户需要决策时就地显示。
- 不承诺恢复刷新、关闭页面或重启浏览器后的任务。协调服务断开但直传正常时，分别显示服务状态与传输状态。
- 同一错误不重复弹窗；系统权限请求只能由明确用户动作触发，不能后台循环弹出。

### 可访问性与动效

所有操作可用键盘完成。页面使用真实标题、按钮、列表和带标签的表单；确定进度提供可访问进度值，不确定阶段不设置虚构的 `aria-valuenow`。

阶段变化和重要结果通过单一、节制的状态消息区域播报；不逐帧播报百分比或每秒把已用时间读一遍。阻断当前操作的错误提供及时可访问通知，并保留可查阅的文字。

旋转活动指示可沿用 15px、2px 边框和 800ms 周期。遵循 `prefers-reduced-motion`，关闭非必要动画和位移；仍以文字、图标和真实运行状态表达任务在进行，不能把减少动效当作暂停传输。

## Do's and Don'ts

### 实现与评审时遵循

- 复用本文件的 token、原型图标和已确认布局。React 组件职责可按本机卡片、设备列表、传输面板、文件队列、任务状态和通用对话框划分，不强制新增组件库。
- 区分“可发现”“已连接”“已保存”；业务状态由真实任务状态机驱动，视图只呈现已确定事实与待处理动作。
- 在默认空闲、普通队列和接收场景下，让桌面目标视口内的当前主操作易于找到；长内容使用受控滚动，不通过压缩字号、命中面积解决空间问题。
- 使用“文件内容不经过服务器”等与当前架构一致的说明；不扩大为身份认证、绝对安全或只在物理局域网传输的承诺。
- 保存路径、文件名、设备名按各自隐私与文本渲染边界处理。完整路径不发给对端；文件名与完整路径不进入常规日志或错误上报。对端只取得已确认清单所需的文件信息。

### 明确避免

- 不增设登录、用户中心、二维码、云端文件历史、文件夹发送、广播发送或未确认的主题切换。
- 不照搬固定配对码、示例设备、模拟速度、加速计时或演示阶段控制。
- 不在正文传完时提前显示成功，不用静止的 100%、伪造百分比或人为等待掩盖校验和保存。
- 不逐文件重新要求整批接收授权，不自动接收清单外文件，不未经说明覆盖原文件或更换接收目录。
- 不把绿色圆点、选中勾、同公网出口或设备显示名当作可信身份的证据。

### 前端交付验收

实现后逐项验证以下要求；本文不替代真实传输、磁盘保存及 10 GiB 完整性验收。

| 验收面 | 必须检查的内容 |
| --- | --- |
| 视觉 | 1440×1000、1280×900、1024×900 下对齐、字号、间距和按钮层级符合 token；无意外横向滚动 |
| 窄窗口与缩放 | 780×1050 和 200% 缩放下可读、可操作；长名称不挤掉状态；长队列和弹窗能滚动 |
| 输入与可访问性 | 全流程键盘操作、可见焦点、标签与错误关联、对话框焦点返回、关键配色对比度达标 |
| 文件与授权 | 空队列、单文件、多文件、超长名称、0 B 文件、系统选择器取消、目录权限撤销；整批只授权一次 |
| 运行状态 | 连接、暂停、恢复、校验、保存、等待确认、全部成功、部分完成、拒收和取消均有真实且明确的表现 |
| 异常与竞态 | 不可达、磁盘满、断线、确认丢失、保存过程中停止队列；结果与实际提交一致 |
| 正式化清理 | 无演示入口、固定示例设备或假进度；保存选择器来自真实系统能力；普通错误提示不泄露本地路径 |

新增组件或状态时，先核对本文是否已有规则；需要改变 token 或用户操作语义时更新对应设计与技术约定，避免实现与文档各自演变。
