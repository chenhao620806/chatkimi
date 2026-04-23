/**
 * PDF 转图片测试脚本
 * 运行方式: node test-pdf.mjs
 */

// 模拟浏览器环境
const fs = require('fs');
const path = require('path');

// 直接测试 pdfjs-dist
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');

async function testPdfConversion() {
  console.log('📄 PDF 转图片测试\n');

  const pdfPath = path.join(__dirname, 'test.pdf');

  if (!fs.existsSync(pdfPath)) {
    console.error('❌ 测试文件不存在:', pdfPath);
    return;
  }

  console.log('✅ 找到测试 PDF 文件');

  // 读取 PDF 文件
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  console.log('✅ 读取 PDF 数据');

  try {
    // 加载 PDF
    const loadingTask = pdfjsLib.getDocument({
      data: data,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/cmaps/',
      cMapPacked: true,
    });

    const pdf = await loadingTask.promise;
    console.log('✅ PDF 加载成功');
    console.log(`   页数: ${pdf.numPages}`);

    // 渲染第一页
    const page = await pdf.getPage(1);
    console.log('✅ 获取到第一页');

    // 设置缩放
    const scale = 2;
    const viewport = page.getViewport({ scale });

    console.log(`   页面尺寸: ${viewport.width}x${viewport.height}`);

    // 创建 canvas
    const canvas = require('canvas');
    const c = canvas.createCanvas(viewport.width, viewport.height);
    const ctx = c.getContext('2d');

    // 渲染
    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    // 保存为 PNG
    const outputPath = path.join(__dirname, 'test-output.png');
    const buffer = c.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);

    console.log('✅ PDF 转换为图片成功!');
    console.log(`   输出文件: ${outputPath}`);
    console.log(`   文件大小: ${buffer.length} bytes`);

    // 清理
    await pdf.destroy();

    console.log('\n🎉 测试通过! PDF 转换功能正常工作');

  } catch (error) {
    console.error('❌ PDF 转换失败:', error.message);
    console.error(error.stack);
  }
}

testPdfConversion();
