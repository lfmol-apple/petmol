"""Cloudflare R2 (S3-compatible) storage provider."""
from .base import StorageProvider


class S3CompatibleStorage(StorageProvider):
    """Cloudflare R2 via boto3."""

    def __init__(self, endpoint: str, access_key_id: str, secret_access_key: str, bucket: str):
        try:
            import boto3
            from botocore.client import Config
        except ImportError as e:
            raise RuntimeError("boto3 is required for R2 storage. Run: pip install boto3") from e

        self.bucket = bucket
        self._s3 = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            config=Config(signature_version="s3v4"),
        )

    def save(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        self._s3.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return key

    def get_url(self, key: str, expires_in: int = 600) -> str:
        return self._s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_in,
        )

    def delete(self, key: str) -> None:
        self._s3.delete_object(Bucket=self.bucket, Key=key)
