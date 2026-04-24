// 快速测试脚本 - 检查页面是否能正常加载
const { chromium } = require('playwright');

(async () => {
  console.log('🚀 启动浏览器...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 打开本地服务器
    await page.goto('http://localhost:3000', { timeout: 10000 });
    console.log('✅ 页面加载成功');
    
    // 检查页面标题
    const title = await page.title();
    console.log(`📄 页面标题: ${title}`);
    
    // 检查是否有输入框
    const input = await page.locator('input[type="text"], textarea').first();
    const inputExists = await input.isVisible();
    console.log(`📝 输入框存在: ${inputExists}`);
    
    // 检查 SyntaxHighlighter 是否导入（检查页面是否有相关样式）
    const pageContent = await page.content();
    
    // 检查关键组件
    console.log(`🎨 SyntaxHighlighter 组件: ${pageContent.includes('react-syntax-highlighter') ? '已导入' : '未导入'}`);
    console.log(`📋 复制按钮: ${pageContent.includes('复制') ? '已添加' : '未添加'}`);
    
    // 截图
    await page.screenshot({ path: 'test-result.png' });
    console.log('📸 截图已保存: test-result.png');
    
  } catch (err) {
    console.error('❌ 错误:', err.message);
    
    // 尝试 3001 端口
    try {
      await page.goto('http://localhost:3001', { timeout: 5000 });
      console.log('✅ 页面加载成功 (3001端口)');
      
      const pageContent = await page.content();
      console.log(`🎨 SyntaxHighlighter: ${pageContent.includes('react-syntax-highlighter') ? '已导入' : '未导入'}`);
      console.log(`📋 复制按钮: ${pageContent.includes('复制') ? '已添加' : '未添加'}`);
      
      await page.screenshot({ path: 'test-result.png' });
      console.log('📸 截图已保存: test-result.png');
      
    } catch (err2) {
      console.error('❌ 3001 端口也不行:', err2.message);
    }
  }
  
  await browser.close();
  console.log('🎉 测试完成！');
})();
