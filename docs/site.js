'use strict'

const translations = {
  'zh-CN': {
    name: '序页',
    title: '序页 · Chrome / Edge 新标签页',
    description: '序页把网页做成新标签页里的卡片。按用途分组、拖动摆放、收藏壁纸，支持 Chrome 和 Edge。',
    navigation: '页面导航', language: '语言', featuresLink: '功能', installLink: '安装',
    hero: '把常用网页放进自己的分组',
    intro: '序页把网页做成可以拖动的卡片。聊天、视频、搜索分开放，打开新标签就能找到。',
    download: 'Chrome / Edge 安装包', repository: '在 GitHub 查看 ↗',
    heroDetail: '六列卡片 · 中文 / English · 默认每分钟换壁纸',
    overviewEyebrow: '页面全貌', overviewTitle: '常用网页，打开就看见',
    overviewBody: '顶部放置顶卡片，下方按用途分组。每一行有六个位置，空位会留在你选择的地方。',
    overviewCaption: '置顶卡片与按用途整理的分组。',
    examples: '分组示例',
    groups: [
      ['搜索与阅读', ['Google', '知乎']],
      ['视频', ['哔哩哔哩', 'YouTube']],
      ['社交', ['X', 'Facebook', 'Instagram']],
      ['AI 工具', ['Gemini', 'ChatGPT', 'Claude Code']]
    ],
    features: [
      { image: 'tabstrip', title: '从正在看的网页里挑选', body: '鼠标移到页面顶部，当前窗口的网页标签副本就会出现。把副本拖到下方，留下想再打开的网页；移开鼠标后，副本收起。', caption: '顶部标签副本展开，网页可以直接拖入分组。' },
      { image: 'groups', title: '拖到组间，就多一个分组', body: '把网页拖到两个分组之间，会先出现新分组的预览，放下后才创建。页面最下方的空白处也能接住网页。拖动组名，调整分组的先后顺序。', caption: '新建分组与预留的空行。' },
      { image: 'cards', title: '卡片沿用你保存的名字', body: '从书签栏拖入时，沿用收藏夹里的名称和浏览器图标。双击标题修改，文字最多显示两行。左键在当前页打开，中键在后台打开新标签；组名旁的按钮可以一键打开整组网页。', caption: '网页图标与卡片操作。' },
      { image: 'history', title: '常用卡片置顶，改动可以撤销', body: '把常用卡片放进顶部固定的“置顶”组，取消置顶后回到原分组。悬停在卡片左侧显示置顶按钮，右侧显示删除按钮。Ctrl+Z 撤销，Ctrl+Y 重做，支持连续操作。', caption: '固定在页面顶部的置顶卡片。' },
      { image: 'pages', title: '需要时，切到第二页', body: '鼠标移到右下角，点击“隐藏页面”切到独立的第二页，再点一次回到原页。第二页初始为空，两页分别保存卡片和分组，共用壁纸与设置。刷新或打开新标签页时，默认显示原页。', caption: '右下角的页面切换按钮与独立的第二页。' },
      { image: 'wallpapers', title: '换一张壁纸，换一种心情', body: '壁纸默认每分钟更换一次，也可以在设置中输入自己的间隔。下方动图以每张 3 秒的速度，展示不同背景下的同一个页面。', caption: '壁纸切换演示：每张 3 秒，循环播放。' },
      { image: 'album', title: '喜欢的壁纸，留进相册', body: '点击爱心收藏当前图片，再点一次取消收藏。相册在页面内打开，三列缩略图保留原比例。每张图都能查看原网址、下载或移除，也可以把整个相册下载到选定的文件夹。', caption: '收藏壁纸的三列相册。' },
      { image: 'settings', title: '把页面调到顺眼', body: '设置从右侧滑入。输入换图间隔，调整背景亮度和卡片不透明度，也能切换中文、English，选择壁纸下载文件夹。设置面板和卡片使用同一透明度。', caption: '右侧设置面板中的换图间隔、外观、语言和下载文件夹。' }
    ],
    installationEyebrow: '开始使用', installationTitle: '安装序页',
    installationIntro: '选择对应浏览器的 ZIP，解压后从扩展管理页加载。',
    step1: '下载安装包，解压到一个长期保留的文件夹。',
    step2: 'Chrome 打开 chrome://extensions/；Edge 打开 edge://extensions/，开启“开发者模式”。',
    step3: '点击“加载已解压的扩展程序”，选择包含 manifest.json 的文件夹。',
    step4: '打开新标签页即可使用，安装后保留解压文件夹。',
    instructions: '查看安装说明 ↗', source: '源码', footerName: '序页 / Prelude'
  },
  en: {
    name: 'Prelude',
    title: 'Prelude · A new tab for Chrome and Edge',
    description: 'Arrange webpages in six-column groups, drag them into place and save wallpapers. A new-tab extension for Chrome and Edge.',
    navigation: 'Page navigation', language: 'Language', featuresLink: 'Features', installLink: 'Install',
    hero: 'Group the pages you return to',
    intro: 'Prelude turns webpages into cards. Keep chats, videos and search tools in their own groups, ready when you open a new tab.',
    download: 'Chrome / Edge packages', repository: 'View on GitHub ↗',
    heroDetail: 'Six-column cards · English / 中文 · Wallpapers change every minute by default',
    overviewEyebrow: 'THE WHOLE PAGE', overviewTitle: 'Your regular pages, in view',
    overviewBody: 'Pinned cards stay at the top, with your own groups below. Each row has six positions. Gaps stay where you leave them.',
    overviewCaption: 'Pinned cards and groups arranged by purpose.',
    examples: 'Example groups',
    groups: [
      ['Search and reading', ['Google', 'Zhihu']],
      ['Video', ['Bilibili', 'YouTube']],
      ['Social', ['X', 'Facebook', 'Instagram']],
      ['AI tools', ['Gemini', 'ChatGPT', 'Claude Code']]
    ],
    features: [
      { image: 'tabstrip', title: 'Keep a page while it is open', body: 'Move the pointer to the top of the page to reveal copies of the tabs in your current window. Drag a copy into a group below. The strip folds away when you leave it.', caption: 'The tab copies are open, ready to drag into a group.' },
      { image: 'groups', title: 'Drop between groups to create one', body: 'Drag a page between two groups to preview a new group, then drop it to create it. The space below the last group works too. Drag a heading to change the order of your groups.', caption: 'A newly created group with an empty row.' },
      { image: 'cards', title: 'Use the names you saved', body: 'Links dragged from the bookmarks bar keep their saved names and browser icons. Double-click a title to edit it; cards display up to two lines. Left-click to open here, middle-click to open in the background, or use the button beside a heading to open the whole group.', caption: 'Website icons and card controls.' },
      { image: 'history', title: 'Pin regular pages and undo changes', body: 'Pin a card to the fixed top group, then unpin it to return it to its original group. Hover over the left side for the pin button or the right side for delete. Use Ctrl+Z to undo and Ctrl+Y to redo multiple changes.', caption: 'A pinned card fixed at the top of the page.' },
      { image: 'pages', title: 'Switch to a second page', body: 'Hover at the bottom right and click “Hide page” to switch to a separate second page; click again to return. The second page starts empty. Each page saves its own cards and groups, while wallpapers and settings are shared. Refreshing or opening a new tab starts on the original page.', caption: 'The page-switch button at the bottom right and the independent second page.' },
      { image: 'wallpapers', title: 'A different background, a different mood', body: 'Wallpapers change every minute by default, or at the interval you enter in Settings. The animation below shows the same page with different backgrounds, changing every three seconds.', caption: 'Wallpaper preview: three seconds per image, looping.' },
      { image: 'album', title: 'Save the wallpapers you like', body: 'Click the heart to save the current image; click again to unsave it. The album opens on the page, with three columns of thumbnails in their original proportions. Open an image’s original URL, download it or remove it. You can also download the whole collection to your chosen folder.', caption: 'Saved wallpapers in a three-column album.' },
      { image: 'settings', title: 'Adjust the page to your taste', body: 'Settings slide in from the right. Enter a wallpaper interval, adjust brightness and card opacity, switch between English and Chinese, or choose a wallpaper download folder. The panel uses the same opacity as your cards.', caption: 'The settings panel: wallpaper timing, appearance, language and download folder.' }
    ],
    installationEyebrow: 'GET STARTED', installationTitle: 'Install Prelude',
    installationIntro: 'Choose the ZIP for your browser, extract it and load the folder from the extensions page.',
    step1: 'Download the package and extract it into a permanent folder.',
    step2: 'Open chrome://extensions/ in Chrome or edge://extensions/ in Edge, and enable Developer mode.',
    step3: 'Choose Load unpacked and select the folder containing manifest.json.',
    step4: 'Open a new tab. Keep the extracted folder after installation.',
    instructions: 'Read the installation guide ↗', source: 'Source', footerName: 'Prelude / 序页'
  }
}

let generation = 0

function addImage(figure, image, caption, language, currentGeneration) {
  figure.hidden = true
  figure.replaceChildren()
  const preview = new Image()
  preview.onload = () => {
    if (generation !== currentGeneration || !figure.isConnected) return
    const picture = document.createElement('img')
    picture.src = preview.src
    picture.alt = caption
    picture.width = preview.naturalWidth
    picture.height = preview.naturalHeight
    picture.loading = image === 'overview' ? 'eager' : 'lazy'
    const note = document.createElement('figcaption')
    note.textContent = caption
    figure.append(picture, note)
    figure.hidden = false
  }
  preview.onerror = () => { /* Unpublished image slots stay hidden. */ }
  preview.src = `assets/${image}-${language === 'zh-CN' ? 'zh' : 'en'}.${image === 'wallpapers' ? 'gif' : 'png'}`
}

function renderSite(language) {
  const selected = Object.hasOwn(translations, language) ? language : 'zh-CN'
  const copy = translations[selected]
  const currentGeneration = ++generation
  document.documentElement.lang = selected
  document.title = copy.title
  document.querySelector('meta[name="description"]').content = copy.description
  document.querySelector('#language').value = selected
  document.querySelector('#language').setAttribute('aria-label', copy.language)
  document.querySelectorAll('[data-copy]').forEach((element) => { element.textContent = copy[element.dataset.copy] })
  document.querySelectorAll('[data-label]').forEach((element) => { element.setAttribute('aria-label', copy[element.dataset.label]) })
  document.querySelector('#readme-link').href = `https://github.com/zzy2670/Prelude/blob/main/${selected === 'zh-CN' ? 'README.zh-CN.md' : 'README.md'}`

  const samples = document.querySelector('#example-groups')
  samples.replaceChildren()
  for (const [title, sites] of copy.groups) {
    const group = document.createElement('section')
    const heading = document.createElement('h3')
    const list = document.createElement('p')
    heading.textContent = title
    list.textContent = sites.join(selected === 'zh-CN' ? '、' : ', ')
    group.append(heading, list)
    samples.append(group)
  }

  addImage(document.querySelector('#overview-image'), 'overview', copy.overviewCaption, selected, currentGeneration)
  const features = document.querySelector('#features')
  features.replaceChildren()
  copy.features.forEach((feature, index) => {
    const section = document.createElement('section')
    section.className = 'feature'
    const content = document.createElement('div')
    content.className = 'feature-copy'
    const number = document.createElement('span')
    number.className = 'feature-number'
    number.textContent = String(index + 1).padStart(2, '0')
    number.setAttribute('aria-hidden', 'true')
    const words = document.createElement('div')
    const heading = document.createElement('h2')
    heading.textContent = feature.title
    const body = document.createElement('p')
    body.textContent = feature.body
    words.append(heading, body)
    content.append(number, words)
    const figure = document.createElement('figure')
    figure.className = 'feature-media'
    figure.hidden = true
    section.append(content, figure)
    features.append(section)
    addImage(figure, feature.image, feature.caption, selected, currentGeneration)
  })
}

let savedLanguage
try { savedLanguage = localStorage.getItem('prelude-site-language') } catch { /* The default works without saved preferences. */ }
renderSite(Object.hasOwn(translations, savedLanguage) ? savedLanguage : 'zh-CN')
document.querySelector('#language').addEventListener('change', (event) => {
  const language = event.target.value
  renderSite(language)
  try { localStorage.setItem('prelude-site-language', language) } catch { /* Language switching remains available. */ }
})
