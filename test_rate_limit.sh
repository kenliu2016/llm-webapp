#!/bin/bash

# 测试速率限制的脚本
echo "开始测试速率限制，将发送10个请求..."

for i in {1..10}
do
    echo "发送请求 $i..."
    curl -v http://localhost:3002/api/conversations
    echo "请求 $i 完成"
    sleep 1  # 短暂延迟避免请求过快
    echo "-------------------"
done

echo "测试完成"