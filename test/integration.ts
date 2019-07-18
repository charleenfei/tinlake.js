// tslint:disable-next-line:variable-name
const SignerProvider = require('ethjs-provider-signer');
const { sign } = require('ethjs-signer');
import assert from 'assert';
const rpcUrl = process.env['ETH_RPC_URL'];
// tslint:disable-next-line:import-name
import BN from 'bn.js';
// tslint:disable-next-line:import-name
import contractAddresses from './addresses_tinlake.json';
// import { sleep } from './utils/sleep';

import Tinlake from '../dist/Tinlake';

const SUCCESS_STATUS = '0x1';

let adminTinlake: Tinlake;
let borrowerTinlake: Tinlake;
const adminEthFrom = `0x${process.env['ETH_FROM']}`;
const borrowerEthFrom = `0x${process.env['BORROWER_ETH_FROM']}`;
const tokenID = `0x${Math.floor(Math.random() * (10 ** 15))}`;
let loanID: string;

const gasLimit = 1000000;
const principal = '100';
const appraisal = '300';
const fee = '1000000564701133626865910626'; // 5 % per day

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('functional tinlake tests', () => {
  before(() => {
    adminTinlake = new Tinlake(
      new SignerProvider(rpcUrl, {
        signTransaction: (rawTx: any, cb: (arg0: null, arg1: any) => void) =>
          cb(null, sign(rawTx, process.env.ETH_PRIVATE_KEY)),
        accounts: (cb: (arg0: null, arg1: string[]) => void) => cb(null, [adminEthFrom]),
      }),
      contractAddresses,
      {
        ethConfig: { from: adminEthFrom, gasLimit: `0x${gasLimit.toString(16)}` },
      },
    );
    borrowerTinlake = new Tinlake(
      new SignerProvider(rpcUrl, {
        signTransaction: (rawTx: any, cb: (arg0: null, arg1: any) => void) =>
          cb(null, sign(rawTx, process.env.BORROWER_ETH_PRIVATE_KEY)),
        accounts: (cb: (arg0: null, arg1: string[]) => void) => cb(null, [borrowerEthFrom]),
      }),
      contractAddresses,
      {
        ethConfig: { from: borrowerEthFrom, gasLimit: `0x${gasLimit.toString(16)}` },
      },
    );
  });

  describe('init fee', function () {
    this.timeout(50000);
    it('init fee successfully', async () => {
      const res = await adminTinlake.initFee(fee);
      console.log('init fee result');
      console.log(res.txHash);
      assert.equal(res.status, SUCCESS_STATUS, 'tx should be successful');
    });

    it('checks whether fee exists successfully', async () => {
      const res = await adminTinlake.existsFee(fee);
      assert.equal(res, true);
    });
  });

  describe('tinlake borrow and repay', function () {
    this.timeout(50000);
    it('borrow and repay successful', async () => {
      console.log('');
      console.log('-------------------------------------');
      console.log('Borrower: Mint NFT');
      console.log('-------------------------------------');

      console.log(`appraisal: ${appraisal}`);
      console.log(`principal: ${principal}`);
      console.log(`token id: ${tokenID}`);
      const mintResult = await borrowerTinlake.mintNFT(borrowerEthFrom, tokenID);
      console.log('mint result');
      console.log(mintResult.txHash);
      assert.equal(mintResult.status, SUCCESS_STATUS, 'tx should be successful');
      assert.equal(mintResult.events[0].event.name, 'Transfer', 'tx should be successful');

      console.log('');
      console.log('-------------------------------------');
      console.log('Admin: Whitelist NFT');
      console.log('-------------------------------------');

      const admitResult = await adminTinlake.adminAdmit(contractAddresses['NFT_COLLATERAL'],
                                                        tokenID, principal, borrowerEthFrom);
      console.log('admit result');
      console.log(admitResult.txHash);

      // parse loanID from event
      loanID = admitResult.events[0].data[2].toString();
      console.log(`Loan id: ${loanID}`);

      assert.equal(admitResult.status, SUCCESS_STATUS, 'tx should be successful');
      assert.equal(admitResult.events[0].event.name, 'Transfer', 'tx should be successful');

      const appraiseResult = await adminTinlake.adminAppraise(loanID, appraisal);
      console.log('appraise result');
      console.log(appraiseResult.txHash);
      assert.equal(appraiseResult.status, SUCCESS_STATUS, 'tx should be successful');

      console.log('');
      console.log('-------------------------------------');
      console.log('Admin: Add fee');
      console.log('-------------------------------------');

      const addFeeResult = await adminTinlake.addFee(loanID, fee, '0');
      console.log('add fee result');
      console.log(addFeeResult.txHash);
      assert.equal(addFeeResult.status, SUCCESS_STATUS, 'tx should be successful');

      console.log('');
      console.log('-------------------------------------');
      console.log('Borrower: Borrow');
      console.log('-------------------------------------');

      const approveResult = await borrowerTinlake.approveNFT(tokenID, contractAddresses['SHELF']);
      console.log('approve result');
      console.log(approveResult.txHash);
      assert.equal(approveResult.status, SUCCESS_STATUS, 'tx should be successful');
      assert.equal(approveResult.events[0].event.name, 'Approval', 'tx should be successful');

      const borrowResult = await borrowerTinlake.borrow(loanID, borrowerEthFrom);
      console.log('borrow result');
      console.log(borrowResult.txHash);
      assert.equal(borrowResult.status, SUCCESS_STATUS, 'tx should be successful');

      const balanceBefore = await borrowerTinlake.balanceOfCurrency(borrowerEthFrom);
      console.log(`DAI Balance after borrow: ${balanceBefore['0'].toString()} DAI`);

      // wait for 1 second to accrue debt
      await sleep(1050);
      const currentDebt = await borrowerTinlake.getCurrentDebt(loanID);
      console.log(currentDebt);
      console.log(`Got current debt of ${currentDebt.toString()}`);

      console.log('');
      console.log('-------------------------------------');
      console.log('Borrower: Repay');
      console.log('-------------------------------------');
      const approveCurResult = await borrowerTinlake.approveCurrency(contractAddresses['PILE'],
                                                                     principal);
      console.log(approveCurResult.txHash);
      assert.equal(approveCurResult.events[0].event.name, 'Approval', 'tx should be successful');
      assert.equal(approveCurResult.status, SUCCESS_STATUS, 'tx should be successful');

      const repayResult = await borrowerTinlake.repay(loanID, principal,
                                                      borrowerEthFrom, borrowerEthFrom);

      console.log(repayResult.txHash);
      assert.equal(repayResult.status, SUCCESS_STATUS, 'tx should be successful');

      const balanceAfter = await borrowerTinlake.balanceOfCurrency(borrowerEthFrom);
      console.log(`DAI Balance after Repay: ${balanceAfter['0'].toString()} DAI`);
    });
  });

  describe('tinlake whitelist and unwhitelist', function () {
    this.timeout(50000);
    it('whitelist and unwhitelist successful', async () => {
      const tokenID = `0x${Math.floor(Math.random() * (10 ** 15))}`;
      let loanID: string = '';
      console.log(`token id: ${tokenID}`);

      const mintResult = await borrowerTinlake.mintNFT(borrowerEthFrom, tokenID);
      console.log('mint result');
      console.log(mintResult.txHash);
      assert.equal(mintResult.status, SUCCESS_STATUS, 'tx should be successful');
      assert.equal(mintResult.events[0].event.name, 'Transfer', 'tx should be successful');

      console.log('');
      console.log('-------------------------------------');
      console.log('Admin: Whitelist NFT');
      console.log('-------------------------------------');

      const admitResult = await adminTinlake.adminAdmit(contractAddresses['NFT_COLLATERAL'],
                                                        tokenID, principal, borrowerEthFrom);
      console.log('admit result');
      console.log(admitResult.txHash);

      // parse loanID from event
      loanID = admitResult.events[0].data[2].toString();
      console.log(`Loan id: ${loanID}`);

      assert.equal(admitResult.status, SUCCESS_STATUS, 'tx should be successful');
      assert.equal(admitResult.events[0].event.name, 'Transfer', 'tx should be successful');

      const appraiseResult = await adminTinlake.adminAppraise(loanID, appraisal);
      console.log('appraise result');
      console.log(appraiseResult.txHash);
      assert.equal(appraiseResult.status, SUCCESS_STATUS, 'tx should be successful');

      console.log('');
      console.log('-------------------------------------');
      console.log('Admin: Unwhitelist NFT');
      console.log('-------------------------------------');

      const unwhiteListResult = await adminTinlake.unwhitelist(loanID, contractAddresses['SHELF'],
                                                               tokenID);
      console.log('unwhitelist result');
      console.log(unwhiteListResult.txHash);
      assert.equal(unwhiteListResult.status, SUCCESS_STATUS, 'tx should be successful');
    });
  });

  describe('tinlake call functionality', function () {
    this.timeout(50000);

    const loanID = '4';
    const tokenID = '0x784079192908932';

    it('count number of loans', async () => {
      const count = await adminTinlake.loanCount();
      console.log(`Found ${count} loans `);
      assert(count.gte(new BN(0)));
    });

    it('get a loan', async () => {
      const res = await adminTinlake.getLoan(loanID);
      assert(BN.isBN(res.price));
      assert(BN.isBN(res.principal));
      assert(typeof res.registry === 'string');
      assert(BN.isBN(res.tokenId));
    });

    it('get balance and debt from pile for a loan', async () => {
      const res = await adminTinlake.getBalanceDebt(loanID);
      assert(BN.isBN(res.balance));
      assert(BN.isBN(res.debt));
    });

    it('gets the owner of a loan', async () => {
      const res = await adminTinlake.ownerOfLoan(loanID);
      assert.equal(typeof res, 'string');
    });

    it('gets the owner of an nft', async () => {
      const res = await adminTinlake.ownerOfNFT(tokenID);
      assert.equal(typeof res, 'string');
    });

    it('gets the appraisal of a loan', async () => {
      const res = await adminTinlake.getAppraisal(loanID);
      assert.equal(res.toString(), appraisal);
    });

    it('gets total debt', async () => {
      const res = await adminTinlake.getTotalDebt();
      console.log(`Total debt: ${res.toString()}`);
      assert(BN.isBN(res));
    });

    it('gets total balance', async () => {
      const res = await adminTinlake.getTotalBalance();
      console.log(`Total balance: ${res.toString()}`);
      assert(BN.isBN(res));
    });

    it('gets total value of NFTs (equals total supply of CVT tokens)', async () => {
      const res = await adminTinlake.getTotalValueOfNFTs();
      console.log(`Total value of NFTs: ${res.toString()}`);
      assert(BN.isBN(res));
    });

    it('gets admin status correctly for admins', async () => {
      const isAdmin = await adminTinlake.isAdmin(adminEthFrom);
      assert(isAdmin === true);
    });

    it('gets admin status correctly for non admins', async () => {
      const isAdmin = await borrowerTinlake.isAdmin(borrowerEthFrom);
      assert(isAdmin === false);
    });
  });
});