// infra/lambda/shared/s3.ts

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { ValidationResult } from './types';

const client = new S3Client({});
const BUCKET = process.env.EXECUTION_DETAIL_BUCKET ?? '';

export function detailKey(tenantId: string, flowId: string, executionId: string): string {
  return `${tenantId}/${flowId}/${executionId}.json`;
}

export async function putExecutionDetail(result: ValidationResult): Promise<string> {
  const key = detailKey(result.tenantId, result.flowId, result.executionId);
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: JSON.stringify(result),
      ContentType: 'application/json',
    }),
  );
  return key;
}

export async function getExecutionDetail(
  tenantId: string,
  flowId: string,
  executionId: string,
): Promise<ValidationResult | null> {
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: detailKey(tenantId, flowId, executionId) }),
    );
    const body = await res.Body?.transformToString();
    return body ? (JSON.parse(body) as ValidationResult) : null;
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'NoSuchKey') return null;
    throw err;
  }
}
