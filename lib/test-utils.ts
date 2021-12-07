// eslint-disable-next-line node/no-extraneous-import
import { BigNumber } from '@ethersproject/bignumber';
// eslint-disable-next-line node/no-unpublished-import
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
// eslint-disable-next-line node/no-unpublished-import
import { ecsign } from 'ethereumjs-util';
// eslint-disable-next-line node/no-unpublished-import
import { ethers } from 'hardhat';

import { MasterContractManager } from '../typechain';

const { keccak256, toUtf8Bytes, defaultAbiCoder, solidityPack } = ethers.utils;

export const MIDAS_KINGDOM_APPROVAL_TYPE_HASH = keccak256(
  toUtf8Bytes(
    'setMasterContractApproval(string warning,address user,address masterContract,bool approvalState,uint256 nonce)'
  )
);

export const deploy = async (
  x: ReadonlyArray<string>,
  y: Array<Array<unknown> | undefined> = [],
  z: ReadonlyArray<SignerWithAddress> = []
): Promise<any> => {
  const contractFactories = await Promise.all(
    x.map((name, index) => ethers.getContractFactory(name, z[index]))
  );

  return Promise.all(
    contractFactories.map((factory, index) =>
      factory.deploy(...(y[index] || []))
    )
  );
};

export const getMidasKingdomDomainSeparator = (
  address: string,
  chainId: number
) =>
  keccak256(
    defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        keccak256(
          toUtf8Bytes(
            'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
          )
        ),
        keccak256(toUtf8Bytes('Midas Kingdom')),
        keccak256(toUtf8Bytes('V1')),
        chainId,
        address,
      ]
    )
  );

export const getMidasKingdomApprovalDigest = (
  midasKingdom: MasterContractManager,
  user: SignerWithAddress,
  masterContractAddress: string,
  approveState: boolean,
  nonce: BigNumber,
  chainId: number = 1
) => {
  const DOMAIN_SEPARATOR = getMidasKingdomDomainSeparator(
    midasKingdom.address,
    chainId
  );
  const message = defaultAbiCoder.encode(
    ['bytes32', 'bytes32', 'address', 'address', 'bool', 'uint256'],
    [
      MIDAS_KINGDOM_APPROVAL_TYPE_HASH,
      approveState
        ? keccak256(
            toUtf8Bytes(
              'Give FULL access to funds in (and approved to) Midas Kingdom V1?'
            )
          )
        : keccak256(toUtf8Bytes('Revoke access to Midas kingdom V1')),
      user.address,
      masterContractAddress,
      approveState,
      nonce,
    ]
  );

  return keccak256(
    solidityPack(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      ['0x19', '0x01', DOMAIN_SEPARATOR, keccak256(message)]
    )
  );
};

export const setMasterContractApproval = async (
  masterKingdom: MasterContractManager,
  from: SignerWithAddress,
  user: SignerWithAddress,
  privateKey: string,
  masterContractAddress: string,
  approvedState: boolean,
  withPermit = false
) => {
  if (!withPermit)
    return masterKingdom
      .connect(from)
      .setMasterContractApproval(
        user.address,
        masterContractAddress,
        approvedState,
        0,
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      );
  const nonce = await masterKingdom.nonces(user.address);
  const chainId = (await user.provider?.getNetwork())?.chainId;
  const digest = getMidasKingdomApprovalDigest(
    masterKingdom,
    user,
    masterContractAddress,
    approvedState,
    nonce,
    chainId
  );
  const { v, r, s } = ecsign(
    Buffer.from(digest.slice(2), 'hex'),
    Buffer.from(privateKey.replace('0x', ''), 'hex')
  );
  return masterKingdom
    .connect(from)
    .setMasterContractApproval(
      user.address,
      masterContractAddress,
      approvedState,
      v,
      r,
      s
    );
};
