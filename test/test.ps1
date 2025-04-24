# 测试MCP图像处理服务器

# 1. 首先确保服务器正在运行 (npm start)

# 2. 创建测试客户端
$clientCode = @"
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function testServer() {
  // 创建客户端连接
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"]
  });

  const client = new Client({
    name: "image-processor-tester",
    version: "1.0.0"
  });

  await client.connect(transport);

  // 列出可用工具
  const { tools } = await client.listTools();
  console.log("Available tools:", Object.values(tools).map(t => t.name));

  // 测试图像转换工具
  const convertResult = await client.callTool({
    name: "image.convertFormat",
    arguments: {
      imagesPath: ["assets/cat.jpg"],
      outputFormat: "webp",
      formatParams: { quality: 80 }
    }
  });
  console.log("Convert result:", convertResult.content[0].text);

  // 测试裁剪工具
  const cropResult = await client.callTool({
    name: "image.cropResize", 
    arguments: {
      imagesPath: ["assets/climbing.png"],
      width: 300,
      height: 200,
      resizeMode: "cover"
    }
  });
  console.log("Crop result:", cropResult.content[0].text);

  // 测试压缩工具
  const compressResult = await client.callTool({
    name: "image.compressOptimize",
    arguments: {
      imagesPath: ["assets/youtube.png"],
      quality: 60,
      stripMetadata: true
    }
  });
  console.log("Compress result:", compressResult.content[0].text);

  // 测试旋转翻转工具
  const rotateFlipResult = await client.callTool({
    name: "image.rotateFlip",
    arguments: {
      imagesPath: ["assets/google.ico"],
      rotateAngle: 90,
      flipHorizontal: true
    }
  });
  console.log("Rotate/Flip result:", rotateFlipResult.content[0].text);

  // 测试后处理工具
  const postProcessResult = await client.callTool({
    name: "image.postProcess",
    arguments: {
      imagesPath: ["assets/myprofile.png"],
      brightness: 0.2,
      contrast: 0.5,
      saturation: -0.3,
      blur: 1.5,
      sharpen: 30
    }
  });
  console.log("Post-process result:", postProcessResult.content[0].text);

  // 测试缩放工具
  const resizeResult = await client.callTool({
    name: "image.resize",
    arguments: {
      imagesPath: ["assets/myprofile.png"],
      width: 400,
      maintainRatio: true
    }
  });
  console.log("Resize result:", resizeResult.content[0].text);
}

testServer().catch(console.error);
"@

# 将测试代码写入临时文件
$testFile = "test-client.js"
$clientCode | Out-File -FilePath $testFile -Encoding utf8

# 执行测试
try {
    node $testFile
}
finally {
    # 清理临时文件
    Remove-Item $testFile
}
