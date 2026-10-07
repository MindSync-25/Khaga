#!/usr/bin/env python3
"""Render non-secret IAM references. Never reads secret values or AWS credentials."""
import argparse,json,pathlib,re
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--secret-arn',required=True)
p.add_argument('--api-id',required=True)
p.add_argument('--output',required=True,type=pathlib.Path)
a=p.parse_args()
if not re.fullmatch(r'arn:aws:secretsmanager:ap-south-1:521199095818:secret:khaga/prod/commerce-[A-Za-z0-9]{6}',a.secret_arn):
 p.error('Expected exact Mumbai account 521199095818 khaga/prod/commerce ARN, including AWS suffix')
if not re.fullmatch(r'[a-z0-9]{10}',a.api_id):p.error('Expected the actual 10-character HTTP API ID')
source=pathlib.Path(__file__).resolve().parents[1]/'infra/iam'
a.output.mkdir(parents=True,exist_ok=True)
for f in source.glob('*.json'):
 text=f.read_text().replace('REPLACE_WITH_PROD_SECRET_ARN',a.secret_arn).replace('REPLACE_WITH_PROD_API_ID',a.api_id)
 if 'REPLACE_WITH_' in text:raise ValueError('Unresolved reference')
 json.loads(text)
 target=a.output/f.name.replace('.template','')
 target.write_text(text)
 print(target)
