// Playwright 测试脚本 - 验证语法高亮和复制按钮
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false }); // 非无头模式，可以看到浏览器
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('🚀 启动浏览器...');
  
  // 打开本地服务器
  await page.goto('http://localhost:3001');
  await page.waitForTimeout(2000); // 等待页面加载
  
  console.log('✅ 页面加载成功');
  
  // 检查页面标题
  const title = await page.title();
  console.log(`📄 页面标题: ${title}`);
  
  // 检查是否有输入框
  const input = await page.locator('input[type="text"], textarea').first();
  const inputExists = await input.isVisible();
  console.log(`📝 输入框存在: ${inputExists}`);
  
  // 发送一条测试消息（包含代码的请求）
  if (inputExists) {
    await input.fill('用 Python 写一个快速排序函数');
    await input.press('Enter');
    console.log('📤 发送消息...');
    
    // 等待响应（最多 30 秒）
    await page.waitForTimeout(30000);
    
    console.log('⏳ 等待响应完成...');
    
    // 检查页面内容
    const pageContent = await page.content();
    
    // 检查是否有代码块
    const hasCodeBlock = pageContent.includes('class="language-python"') || 
                          pageContent.includes('language-python') ||
                          pageContent.includes('pre class="');
    console.log(`🎨 代码块存在: ${hasCodeBlock}`);
    
    // 检查 SyntaxHighlighter 是否渲染
    const hasSyntaxHighlighter = pageContent.includes('react-syntax-highlighter') || 
                                  pageContent.includes('atomOneDark') ||
                                  pageContent.includes('atom-dark');
    console.log(`✨ SyntaxHighlighter 渲染: ${hasSyntaxHighlighter}`);
    
    // 检查复制按钮
    const hasCopyButton = pageContent.includes('复制');
    console.log(`📋 复制按钮存在: ${hasCopyButton}`);
    
    // 截图保存
    await page.screenshot({ path: 'test-result.png', fullPage: true });
    console.log('📸 截图已保存: test-result.png');
  }
  
  await browser.close();
  console.log('🎉 测试完成！');
})();
