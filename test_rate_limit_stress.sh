#!/bin/bash

# 压力测试速率限制的脚本
echo "开始压力测试，将发送110个请求来触发速率限制..."

success_count=0
rate_limit_count=0
other_error_count=0

echo "请求序号,HTTP状态码,RateLimit-Remaining,RateLimit-Reset" > results.csv

echo "开始发送请求..."
for i in {1..110}
do
    echo -n "发送请求 $i..."
    response=$(curl -v http://localhost:3002/api/conversations 2>&1)
    status_code=$(echo "$response" | grep -o 'HTTP/1.1 [0-9][0-9][0-9]' | awk '{print $2}')
    remaining=$(echo "$response" | grep -o 'RateLimit-Remaining: [0-9]\+' | awk '{print $2}')
    reset=$(echo "$response" | grep -o 'RateLimit-Reset: [0-9]\+' | awk '{print $2}')
    
    echo "$i,$status_code,$remaining,$reset" >> results.csv
    
    if [ "$status_code" = "200" ]; then
        echo "成功"
        success_count=$((success_count + 1))
    elif [ "$status_code" = "429" ]; then
        echo "速率限制！"
        rate_limit_count=$((rate_limit_count + 1))
    else
        echo "错误状态码: $status_code"
        other_error_count=$((other_error_count + 1))
    fi
    
    if [ $((i % 10)) -eq 0 ]; then
        echo "已完成 $i 个请求"
    fi
done

echo "测试完成！"
echo "成功请求: $success_count"
echo "速率限制请求: $rate_limit_count"
echo "其他错误请求: $other_error_count"
echo "结果已保存到 results.csv"