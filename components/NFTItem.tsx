import React from 'react';
import { Card } from 'antd';
import styles from '../styles/NFTList.module.scss';

interface Props {
  image: string;
  idx: number;
  handleClicked?: (idx: number) => void;
  isChoose: boolean;
}

const { Meta } = Card;

const NFTItem: React.FC<Props> = ({ image, idx, handleClicked, isChoose }) => {
  return (
    <Card
      className={styles.myItemNFT}
      hoverable
      style={isChoose ? { border: 'solid 2px #80ff00' } : { border: 'none' }}
      cover={
        <img
          alt=""
          src={image}
          onClick={() => {
            handleClicked && handleClicked(idx);
          }}
        />
      }
    >
      <Meta title="test" />
    </Card>
  );
};

export default NFTItem;
